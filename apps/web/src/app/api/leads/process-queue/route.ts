import { createHmac } from 'node:crypto'
import { NextResponse } from 'next/server'
import { decryptToken, encryptToken, normalizePhone } from '@advezo/utils'
import { createSupabaseServiceClient } from '@advezo/database'
import type { Lead, LeadProcessingQueue, QualificationRule } from '@advezo/types'
import { sendCompleteRegistrationCapi, sendLeadCapi } from '@/lib/capi/leads'
import { evaluateQualificationRules } from '@/lib/leads/qualification'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/leads/process-queue — Processamento assíncrono de Lead Ads (Story 8.6).
 *
 * Endpoint de cron Railway (schedule a cada minuto), SEM sessão de usuário: como nos demais
 * crons (sync/meta, alerts/detect) e no webhook (Story 8.5), usa createSupabaseServiceClient()
 * (service-role, ignora RLS) e escopa toda escrita por workspace_id explicitamente.
 *
 * Guard (AC 8.6.1): header `x-cron-secret` DEVE bater com process.env.CRON_SECRET — 401
 * caso contrário (inclusive ausente). Validado ANTES de qualquer processamento.
 *
 * Fluxo (Workflow 2 — SPEC Seção 7):
 *   1. SELECT até 10 itens pending (LIMIT 10, ORDER BY enqueued_at ASC) — AC 8.6.2.
 *   2. Promise.allSettled(items.map(processItem)) — falha de um item NÃO cancela os
 *      demais (AC 8.6.2 / NFR-PERF-3 — CRÍTICO).
 *   3. Por item: status='processing' → Graph API → normaliza → hash/cripto → INSERT leads
 *      → dedup 23505 → qualification → CAPI → status='completed'.
 *
 * SEGURANÇA:
 *  - encrypted_token descriptografado EM MEMÓRIA — nunca logado (padrão SEC-1, Story 2.3).
 *  - email_encrypted = AES-256-GCM — SEMPRE para lead_ads (base legal: termos Meta).
 *  - phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_id-como-salt) — não SHA256
 *    simples (não há coluna `salt` em workspaces; mesmo AUTO-DECISION da Story 8.3).
 *  - Token Graph API vai como query param (exigência Meta/TLS) — não logado.
 */

const GRAPH_VERSION = 'v19.0'
const BATCH_LIMIT = 10
const MAX_RETRIES = 3

/** Resultado do processamento de um item (controla os contadores do response). */
type ItemOutcome = 'completed' | 'none' | 'failed'

/** Linha mínima de ad_accounts necessária para o token e o escopo de workspace. */
interface AdAccountRow {
  id: string
  workspace_id: string
  encrypted_token: string
  external_account_id: string
}

/** Resposta esperada da Graph API para um leadgen (AC 8.6.3 / 8.6.4). */
interface GraphLeadResponse {
  field_data?: { name?: string; values?: string[] }[]
  full_name?: string
  phone_number?: string
  email?: string
}

/** Lê TOKEN_ENCRYPTION_KEY do ambiente ou lança (nunca loga a chave). */
function requireEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY não configurada')
  return key
}

/**
 * Chama a Graph API para buscar os dados de um leadgen (AC 8.6.3). Lança em erro HTTP —
 * o caller (processItem) trata via retry. O token vai como query param (exigência Meta);
 * extraímos apenas a mensagem da Meta em erro, nunca o corpo bruto (pode ecoar dados).
 */
async function fetchLeadData(
  metaLeadId: string,
  token: string
): Promise<GraphLeadResponse> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(metaLeadId)}` +
    `?fields=field_data,full_name,phone_number,email&access_token=${token}`

  const res = await fetch(url)
  if (!res.ok) {
    let detail = `http_${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* corpo não-JSON — manter http_status */
    }
    throw new Error(detail)
  }
  return (await res.json()) as GraphLeadResponse
}

/**
 * Normaliza os campos da Graph API (AC 8.6.4): campos de topo (full_name/phone_number/
 * email) têm prioridade; field_data[] é fallback. Retorna também o mapa name→value
 * (field_data) persistido em leads.field_data.
 */
function normalizeLeadFields(data: GraphLeadResponse): {
  name: string
  rawPhone: string
  email: string | null
  fieldMap: Record<string, unknown>
} {
  const fieldMap: Record<string, unknown> = {}
  for (const f of data.field_data ?? []) {
    if (f?.name) fieldMap[f.name] = f.values?.[0] ?? null
  }

  const name =
    data.full_name ??
    (typeof fieldMap.full_name === 'string' ? fieldMap.full_name : undefined) ??
    (typeof fieldMap.name === 'string' ? fieldMap.name : undefined) ??
    ''
  const rawPhone =
    data.phone_number ??
    (typeof fieldMap.phone_number === 'string' ? fieldMap.phone_number : undefined) ??
    (typeof fieldMap.phone === 'string' ? fieldMap.phone : undefined) ??
    ''
  const email =
    data.email ??
    (typeof fieldMap.email === 'string' ? fieldMap.email : null) ??
    null

  return { name, rawPhone, email, fieldMap }
}

/**
 * Trata a falha de processamento de um item (AC 8.6.3): incrementa retry_count; ao atingir
 * MAX_RETRIES marca status='failed' e registra em sync_errors (NFR-4: falha nunca silenciosa);
 * senão volta para 'pending' (sem next_retry_at — coluna inexistente no schema). A mensagem
 * de erro nunca contém o token (já filtrada em fetchLeadData).
 */
async function handleItemFailure(
  supabase: any,
  item: LeadProcessingQueue,
  message: string
): Promise<ItemOutcome> {
  const newCount = item.retry_count + 1
  const failed = newCount >= MAX_RETRIES

  await supabase
    .from('lead_processing_queue')
    .update({
      status: failed ? 'failed' : 'pending',
      retry_count: newCount,
      last_error: message,
    })
    .eq('id', item.id)

  if (failed) {
    await supabase.from('sync_errors').insert({
      workspace_id: item.workspace_id,
      ad_account_id: item.ad_account_id,
      error_type: 'lead_processing_failed',
      error_message: message,
    })
  }

  return 'failed'
}

/**
 * Processa um item da fila (AC 8.6.2–8.6.8). Retorna o desfecho; NUNCA lança — toda exceção
 * é capturada e convertida em retry (AC 8.6.3), garantindo que Promise.allSettled jamais veja
 * uma rejeição que pudesse mascarar a contagem.
 */
async function processItem(item: LeadProcessingQueue): Promise<ItemOutcome> {
  const supabase = createSupabaseServiceClient()

  // AC 8.6.2: marca 'processing' no início (evita double-processing se o cron sobrepuser).
  await supabase
    .from('lead_processing_queue')
    .update({ status: 'processing' })
    .eq('id', item.id)

  try {
    // Buscar ad_account e descriptografar o token (escopo explícito; service-role ignora RLS).
    const { data: adAccountRaw } = await supabase
      .from('ad_accounts')
      .select('id, workspace_id, encrypted_token, external_account_id')
      .eq('id', item.ad_account_id)
      .maybeSingle()

    const adAccount = adAccountRaw as AdAccountRow | null
    if (!adAccount) throw new Error('ad_account não encontrada')

    const encryptionKey = requireEncryptionKey()
    const token = decryptToken(adAccount.encrypted_token, encryptionKey)

    // AC 8.6.3 — Graph API. Erro HTTP lança → cai no catch → retry (AC 8.6.3).
    const leadData = await fetchLeadData(item.meta_lead_id, token)

    // AC 8.6.4 — normalização.
    const { name, rawPhone, email, fieldMap } = normalizeLeadFields(leadData)

    // AC 8.6.5 — hash + cripto. phone_hash usa workspace_id como salt (sem coluna `salt`).
    const normalizedPhone = normalizePhone(rawPhone)
    const phoneHash = createHmac('sha256', adAccount.workspace_id)
      .update(normalizedPhone)
      .digest('hex')
    const emailEncrypted = email ? encryptToken(email, encryptionKey) : null

    // AC 8.6.7 — lookup do lead_ads_config por ad_account_id (a fila não persiste
    // leadgen_form_id; Story 8.5 só gravou meta_lead_id/ad_account_id). O config liga
    // a conta ao client. Ausente → lead órfão (client_id=null) — log de aviso, não erro.
    const { data: cfg } = await supabase
      .from('lead_ads_configs')
      .select('client_id')
      .eq('ad_account_id', item.ad_account_id)
      .eq('workspace_id', item.workspace_id)
      .limit(1)
      .maybeSingle()

    const clientId = (cfg as { client_id: string | null } | null)?.client_id ?? null
    if (!cfg) {
      console.warn(
        '[process-queue] lead_ads_config não encontrada para ad_account:',
        item.ad_account_id
      )
    }

    // AC 8.6.6 — INSERT com captura explícita de 23505 (dedup de double-delivery Meta).
    const { data: insertedRaw, error: insertError } = await supabase
      .from('leads')
      .insert({
        workspace_id: adAccount.workspace_id,
        client_id: clientId,
        lead_form_id: null, // lead_ads não vem de um lead_form
        meta_lead_id: item.meta_lead_id,
        source: 'lead_ads',
        status: 'novo',
        name,
        phone_hash: phoneHash,
        email_encrypted: emailEncrypted,
        consent_given_at: null, // AC 8.6.5 — base legal não é consentimento LGPD
        field_data: fieldMap,
      })
      .select('*')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        // Double-delivery da Meta — lead já existe → completed SEM CAPI (action:'none').
        await supabase
          .from('lead_processing_queue')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', item.id)
        return 'none'
      }
      throw insertError // outro erro → catch → retry (AC 8.6.3)
    }

    const lead = insertedRaw as Lead

    // AC 8.6.8 — qualificação + CAPI. Lead Ads não tem lead_form → sem qualification_rules
    // aplicáveis no schema atual: rules=[] → evaluateQualificationRules retorna false →
    // dispara apenas o evento Lead; CompleteRegistration não dispara automaticamente.
    const rules: QualificationRule[] = []
    const isQualified = evaluateQualificationRules(fieldMap, rules)

    await sendLeadCapi(lead, item.ad_account_id, supabase, encryptionKey)
    if (isQualified) {
      await sendCompleteRegistrationCapi(lead, item.ad_account_id, supabase, encryptionKey)
    }

    await supabase
      .from('lead_processing_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', item.id)

    return 'completed'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return handleItemFailure(supabase, item, message)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // AC 8.6.1 — guard x-cron-secret ANTES de qualquer processamento.
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  // AC 8.6.2 — até 10 itens pending, ordenados por enqueued_at ASC (FIFO).
  const { data: pendingRaw } = await supabase
    .from('lead_processing_queue')
    .select('*')
    .eq('status', 'pending')
    .order('enqueued_at', { ascending: true })
    .limit(BATCH_LIMIT)

  const items = (pendingRaw ?? []) as LeadProcessingQueue[]

  // AC 8.6.2 (CRÍTICO) — Promise.allSettled: falha de um item NÃO cancela os demais.
  const results = await Promise.allSettled(items.map(processItem))

  let processed = 0
  let failed = 0
  let skipped = 0
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value === 'completed') processed += 1
      else if (result.value === 'none') skipped += 1
      else failed += 1
    } else {
      // processItem nunca rejeita, mas defesa em profundidade: rejeição inesperada = falha.
      failed += 1
    }
  }

  return NextResponse.json({ processed, failed, skipped })
}
