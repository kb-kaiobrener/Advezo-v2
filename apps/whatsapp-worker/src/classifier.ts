// classifier.ts — Worker de classificação por IA (Epic 5, Story 5.3)
//
// Polling em conversation_classification_queue (status=pending) a cada
// CLASSIFICATION_POLL_INTERVAL min (padrão 5). Para cada item: carrega o
// histórico CIFRADO de conversation_messages, decripta EM MEMÓRIA, monta o
// prompt e chama a API Anthropic (via DI — testável com mock). Resultado em
// conversation_classifications (UNIQUE conversation_id → upsert) +
// classification_status na conversa + fila done/failed com retry (máx. 3).
//
// ⚠️ LGPD (AC 5.3.9 — NOTA OBRIGATÓRIA): este worker processa conteúdo
// integral de mensagens de pessoas identificáveis via API de subprocessador
// (Anthropic). Base legal: legítimo interesse. Retenção do conteúdo bruto:
// máx. 90 dias pós-classificação (cron cleanup-messages). O subprocessamento
// Anthropic deve constar dos termos de uso do produto.
//
// GATE DE ATIVAÇÃO (exceção 4 do modo semi-autônomo): a chamada REAL só ocorre
// com CLASSIFICATION_ENABLED=true E ANTHROPIC_API_KEY configuradas — ligar a
// flag em produção/staging é o ato explícito de aprovação da primeira rodada
// contra dado real.

import { decryptToken } from '@advezo/utils'
import { createSupabaseServiceClient } from '@advezo/database/service'

export interface Classification {
  funnel_stage: 'awareness' | 'interest' | 'consideration' | 'intent' | 'sale'
  is_sale: boolean
  sale_value_estimate: number | null
  confidence_score: number
  reasoning: string
}

export interface ClassifierDeps {
  db?: ReturnType<typeof createSupabaseServiceClient>
  callModel?: (prompt: string) => Promise<{ text: string; modelVersion: string }>
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

const MAX_RETRIES = 3

/** Chamada real à Anthropic (usada só quando CLASSIFICATION_ENABLED=true). */
export async function callAnthropic(prompt: string): Promise<{ text: string; modelVersion: string }> {
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { model: string; content: Array<{ text: string }> }
  return { text: body.content?.[0]?.text ?? '', modelVersion: body.model }
}

export function buildPrompt(messages: Array<{ direction: string; text: string }>): string {
  const historico = messages
    .map(m => `${m.direction === 'in' ? 'LEAD' : 'ATENDENTE'}: ${m.text}`)
    .join('\n')
  return `Você classifica conversas de WhatsApp entre um LEAD e um ATENDENTE de negócio.
Responda APENAS com JSON válido, sem markdown, no formato:
{"funnel_stage":"awareness|interest|consideration|intent|sale","is_sale":boolean,"sale_value_estimate":number|null,"confidence_score":0.0-1.0,"reasoning":"breve"}

Conversa:
${historico}`
}

export function parseClassification(text: string): Classification {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('resposta sem JSON')
  const c = JSON.parse(jsonMatch[0]) as Classification
  const stages = ['awareness', 'interest', 'consideration', 'intent', 'sale']
  if (!stages.includes(c.funnel_stage)) throw new Error(`funnel_stage inválido: ${c.funnel_stage}`)
  if (typeof c.is_sale !== 'boolean') throw new Error('is_sale inválido')
  if (typeof c.confidence_score !== 'number' || c.confidence_score < 0 || c.confidence_score > 1)
    throw new Error('confidence_score inválido')
  return c
}

/** Processa um item da fila. Exportado para teste. */
export async function processQueueItem(
  item: { id: string; workspace_id: string; conversation_id: string; retry_count: number },
  deps: ClassifierDeps = {}
): Promise<void> {
  const db = deps.db ?? createSupabaseServiceClient()
  const callModel = deps.callModel ?? callAnthropic
  const log = deps.log ?? (() => {})

  await db.from('conversation_classification_queue')
    .update({ status: 'processing' }).eq('id', item.id)
  try {
    // AC 5.3.8: nunca classificar untracked (guard mesmo com a fila filtrando)
    const { data: conv } = await db.from('tracked_conversations')
      .select('id, status').eq('id', item.conversation_id).maybeSingle()
    if (!conv || conv.status !== 'tracked') {
      await db.from('conversation_classification_queue')
        .update({ status: 'done', processed_at: new Date().toISOString(), error: 'untracked — ignorada' })
        .eq('id', item.id)
      return
    }

    const key = process.env.TOKEN_ENCRYPTION_KEY
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY ausente — histórico indecriptável')

    const { data: msgs } = await db.from('conversation_messages')
      .select('direction, content_encrypted')
      .eq('conversation_id', item.conversation_id)
      .order('message_at', { ascending: true }).limit(50)
    if (!msgs?.length) throw new Error('conversa sem mensagens armazenadas')

    // decriptação EM MEMÓRIA — nada decriptado é persistido (LGPD)
    const historico = msgs.map((m: { direction: string; content_encrypted: string }) => ({
      direction: m.direction,
      text: decryptToken(m.content_encrypted, key),
    }))

    const { text, modelVersion } = await callModel(buildPrompt(historico))
    const c = parseClassification(text)

    await db.from('conversation_classifications').upsert({
      workspace_id: item.workspace_id,
      conversation_id: item.conversation_id,
      funnel_stage: c.funnel_stage,
      is_sale: c.is_sale,
      sale_value_estimate: c.sale_value_estimate,
      confidence_score: c.confidence_score,
      classified_at: new Date().toISOString(),
      model_version: modelVersion,           // AC 5.3.7
    }, { onConflict: 'conversation_id' })
    await db.from('tracked_conversations')
      .update({ classification_status: 'classified' }).eq('id', item.conversation_id)
    await db.from('conversation_classification_queue')
      .update({ status: 'done', processed_at: new Date().toISOString(), error: null })
      .eq('id', item.id)
    log('classificada', { conversation: item.conversation_id, stage: c.funnel_stage })
  } catch (e) {
    const err = (e as Error).message.slice(0, 300)
    const retries = item.retry_count + 1
    if (retries >= MAX_RETRIES) {
      // AC 5.3.6: falha permanente + conversa marcada p/ revisão manual
      await db.from('conversation_classification_queue')
        .update({ status: 'failed', error: err, retry_count: retries, processed_at: new Date().toISOString() })
        .eq('id', item.id)
      await db.from('tracked_conversations')
        .update({ classification_status: 'failed' }).eq('id', item.conversation_id)
      log('falha PERMANENTE (3 tentativas)', { item: item.id, err })
    } else {
      await db.from('conversation_classification_queue')
        .update({ status: 'pending', error: err, retry_count: retries }).eq('id', item.id)
      log('falha — reagendada', { item: item.id, retry: retries, err })
    }
  }
}

/** Um ciclo de polling (AC 5.3.1). Exportado para teste e para o setInterval. */
export async function pollClassificationQueue(deps: ClassifierDeps = {}): Promise<number> {
  const db = deps.db ?? createSupabaseServiceClient()
  const { data: items } = await db.from('conversation_classification_queue')
    .select('id, workspace_id, conversation_id, retry_count')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(10)
  for (const item of items ?? []) await processQueueItem(item, deps)
  return (items ?? []).length
}
