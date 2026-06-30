import { createHmac, timingSafeEqual } from 'node:crypto'
import { createSupabaseServiceClient } from '@advezo/database'

/**
 * Webhook Meta Lead Ads — GET (challenge verify) + POST (recebimento de leads) — Story 8.5.
 *
 * Endpoint server-to-server (Meta → Advezo), NÃO um endpoint público para browsers:
 *   - CORS FECHADO (AC 8.5.6): nenhum header Access-Control-Allow-* — webhook não é
 *     chamado por XHR de browser, então CORS aberto seria incorreto e perigoso.
 *   - Sem JWT: como nos crons e no endpoint público de submit (Story 8.3), usamos
 *     createSupabaseServiceClient() (service-role, ignora RLS) e escopamos toda escrita
 *     por workspace_id explicitamente.
 *
 * SEGURANÇA (FR-LA3 — AC 8.5.2 / 8.5.3):
 *   - POST: a PRIMEIRA operação é validar X-Hub-Signature-256 sobre o RAW BODY.
 *     O HMAC-SHA256 precisa ser computado sobre os bytes exatos que a Meta assinou;
 *     request.json() consumiria e re-serializaria o stream (ordem de chaves/whitespace
 *     divergiriam), invalidando toda assinatura. Por isso lemos request.text() ANTES
 *     de qualquer parse.
 *   - Comparação com timingSafeEqual (constant-time), NUNCA `===` — `===` em strings
 *     faz short-circuit no primeiro byte divergente, vazando timing que permitiria
 *     reconstruir o HMAC byte a byte. Guardamos o length antes (timingSafeEqual lança
 *     em buffers de tamanhos diferentes) e respondemos 403, não exceção.
 *   - META_APP_SECRET: nunca logado, nunca em response. Secret ausente → fail closed (500).
 */

/** Estrutura mínima esperada do payload Meta Lead Ads (FR-LA4). */
interface MetaLeadgenChangeValue {
  leadgen_id?: string
  ad_account_id?: string
  form_id?: string
  page_id?: string
  created_time?: number
}

interface MetaLeadgenChange {
  field?: string
  value?: MetaLeadgenChangeValue
}

interface MetaLeadgenEntry {
  id?: string
  time?: number
  changes?: MetaLeadgenChange[]
}

interface MetaLeadgenPayload {
  object?: string
  entry?: MetaLeadgenEntry[]
}

/**
 * GET /api/webhooks/meta/leadgen — challenge verification (AC 8.5.1).
 *
 * A Meta envia hub.mode=subscribe, hub.verify_token e hub.challenge ao configurar a
 * subscription. Fazemos lookup do verify_token em workspace_settings (índice
 * ws_verify_token_idx). Se mode='subscribe' e token encontrado → ecoa hub.challenge em
 * texto puro (200). Caso contrário → 403.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token) {
    return new Response('Invalid verification', { status: 403 })
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('workspace_settings')
    .select('workspace_id')
    .eq('meta_leadgen_verify_token', token)
    .maybeSingle()

  if (error || !data) {
    // Token não encontrado (ou erro de lookup) → 403. Não vazar detalhe do erro.
    return new Response('Token not found', { status: 403 })
  }

  // hub.challenge ecoado em texto puro — a Meta exige o valor exato no body.
  return new Response(challenge ?? '', { status: 200 })
}

/**
 * POST /api/webhooks/meta/leadgen — recebimento de leads (AC 8.5.2–8.5.5).
 *
 * Ordem estrita: ler raw body → checar header presente → computar HMAC esperado →
 * comparar constant-time → só então parsear e enfileirar. Nenhuma query/lookup/log do
 * conteúdo do payload ocorre antes da assinatura passar.
 */
export async function POST(request: Request): Promise<Response> {
  // 1. [AC 8.5.3] RAW BODY antes de qualquer parse — bytes exatos que a Meta assinou.
  const rawBody = await request.text()

  // 2. [AC 8.5.2] Header de assinatura obrigatório — ausente → 403 imediato.
  const signature = request.headers.get('x-hub-signature-256')
  if (!signature) {
    return new Response('Missing signature', { status: 403 })
  }

  // 3. Secret ausente → fail closed (500), nunca bypass da validação.
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    // Não vazar a causa; META_APP_SECRET nunca aparece em logs/response.
    return new Response('Server misconfiguration', { status: 500 })
  }

  // 4. [AC 8.5.2] HMAC-SHA256(rawBody, META_APP_SECRET), formato `sha256=<hex>`.
  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')

  // 5. [AC 8.5.3 — CRÍTICO] Comparação constant-time. timingSafeEqual lança em buffers
  //    de tamanhos diferentes, então guardamos o length antes e respondemos 403.
  const sigBuffer = Buffer.from(signature)
  const expBuffer = Buffer.from(expected)
  if (
    sigBuffer.length !== expBuffer.length ||
    !timingSafeEqual(sigBuffer, expBuffer)
  ) {
    return new Response('Invalid signature', { status: 403 })
  }

  // 6. Assinatura válida — DEPOIS disso podemos parsear com segurança.
  let payload: MetaLeadgenPayload
  try {
    payload = JSON.parse(rawBody) as MetaLeadgenPayload
  } catch {
    // Body assinado mas não-JSON: assinatura confere mas payload inválido → 400.
    return new Response('Invalid payload', { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // 7. [AC 8.5.4] Iterar sobre todos os changes (um payload pode trazer múltiplos leads).
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue

      const leadgenId = change.value?.leadgen_id
      const externalAdAccountId = change.value?.ad_account_id
      if (!leadgenId || !externalAdAccountId) continue

      // Mapear o ad_account externo da Meta para o registro interno (e seu workspace).
      const { data: adAccount } = await supabase
        .from('ad_accounts')
        .select('id, workspace_id')
        .eq('external_account_id', externalAdAccountId)
        .maybeSingle()

      // Conta não mapeada no Advezo → ignorar silenciosamente (não é erro).
      if (!adAccount) continue

      // [AC 8.5.4] INSERT na fila. Violação de lead_queue_meta_lead_id_unique (23505)
      // = entrega duplicada da Meta → idempotente, ignorada silenciosamente.
      const { error: insertError } = await supabase
        .from('lead_processing_queue')
        .insert({
          workspace_id: adAccount.workspace_id,
          meta_lead_id: leadgenId,
          ad_account_id: adAccount.id,
          status: 'pending',
        })

      if (insertError && insertError.code !== '23505') {
        // Erro real de fila — logar o code (nunca o secret/payload sensível) e seguir
        // para os demais changes; o ACK 200 ainda é devido à Meta.
        console.error(
          '[webhook-leadgen] queue insert error:',
          insertError.code ?? 'unknown'
        )
      }
    }
  }

  // 8. [AC 8.5.5] ACK imediato — 200 OK após validação + enfileiramento. O processamento
  //    do lead é assíncrono (Story 8.6); aqui não esperamos por ele.
  return new Response('OK', { status: 200 })
}
