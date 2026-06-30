import { createHash } from 'node:crypto'
import { decryptToken } from '@advezo/utils'
import type {
  CAPIEventName,
  CAPILeadPayload,
  CAPIUserData,
  ConversionEventStatus,
  Lead,
} from '@advezo/types'
import type { SupabaseClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Disparo real de eventos Meta Conversions API (CAPI) para leads — Story 8.7.
 *
 * Implementa o transporte HTTP à Graph API que a Story 8.3/8.4 deixaram como stub,
 * com o gate de consentimento LGPD diferenciado por fonte como peça central.
 *
 * ── SEGURANÇA (AC 8.7.2 — CRÍTICO) ───────────────────────────────────────────
 *  - `email_encrypted` NUNCA é logado, NUNCA enviado ao client, NUNCA exposto em
 *    response. A única forma persistida do email é o ciphertext AES-256-GCM.
 *  - `SHA256(email)` é calculado EM MEMÓRIA a partir do plaintext descriptografado e
 *    descartado imediatamente. NUNCA é gravado como coluna no banco.
 *  - `phone_hash` já é HMAC-SHA256 com workspace_salt — usado diretamente como `ph`.
 *  - O token de acesso Meta é descriptografado em memória para a chamada — não logado.
 *
 * ── GATE DE CONSENTIMENTO POR FONTE (AC 8.7.2) ───────────────────────────────
 *  - source='landing_page': inclui `em` SOMENTE se `consent_given_at IS NOT NULL`
 *    (base legal LGPD: consentimento explícito do titular).
 *  - source='lead_ads': inclui `em` SEMPRE que houver email (base legal: termos Meta,
 *    o titular consentiu no próprio formulário nativo da Meta). Adiciona `lead_id`.
 *
 * ── NOTA DE SCHEMA (gaps documentados — ver Dev Notes da Story 8.7) ──────────
 *  - `workspace_settings.meta_conversions_api_enabled` NÃO existe no schema aplicado.
 *    O gate operativo é `meta_pixel_id IS NOT NULL` (CAPI está habilitada exatamente
 *    quando há pixel configurado). A flag booleana é lida defensivamente para honrar
 *    uma migration futura, mas não bloqueia hoje quando ausente.
 *  - `conversion_events` NÃO existe em nenhuma migration aplicada (pertence a epic
 *    futuro). A persistência de auditoria (skipped/pending/sent/failed) só é feita
 *    quando a tabela existir; senão, o registro é deferido e logado.
 */

const GRAPH_API_VERSION = 'v19.0'

/**
 * Tipo mínimo de client Supabase aceito (server-role ou service-role). O projeto não
 * gera tipos de schema do banco, então o client é efetivamente não-tipado nas tabelas —
 * `any` aqui apenas reflete essa realidade (queries são escopadas por workspace_id no
 * código, não pelo type system).
 */
type AnySupabase = SupabaseClient<any, any, any>

/** Conta de anúncio mínima necessária para o gate de envio (token + status). */
export interface CapiAdAccount {
  id: string
  encrypted_token: string
  status: string
}

/** Resultado do gate de envio CAPI (AC 8.7.3). */
export interface CapiGateResult {
  enabled: boolean
  pixelId?: string
  token?: string
  /** Motivo legível quando `enabled=false` — para o registro `skipped` de auditoria. */
  skipReason?: string
}

/** Resultado de um disparo CAPI — auditável, sem dados sensíveis. */
export interface CapiDispatchResult {
  status: ConversionEventStatus
  eventName: CAPIEventName
  /** Mensagem de erro/skip (nunca contém PII). */
  message?: string
}

/**
 * SHA256(lowercase(trim(value))) em hex — formato exigido pela Meta CAPI (AC 8.7.2).
 * Usado APENAS em memória; o resultado nunca é persistido.
 */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Monta o `user_data` do payload CAPI com o gate de consentimento diferenciado por
 * fonte (AC 8.7.2 — CRÍTICO). Exportada para teste — é o coração da regra LGPD.
 *
 * @param lead linha completa de `leads` (phone_hash, email_encrypted, source, ...).
 * @param encryptionKey chave AES-256-GCM (hex) — TOKEN_ENCRYPTION_KEY.
 */
export function buildUserData(lead: Lead, encryptionKey: string): CAPIUserData {
  // phone_hash já é HMAC-SHA256 — usar diretamente como 'ph' (AC 8.7.1).
  const userData: CAPIUserData = { ph: [lead.phone_hash] }

  // Gate de email diferenciado por fonte (FR-CAPI3 e FR-CAPI4).
  if (lead.email_encrypted) {
    const includeEmail =
      lead.source === 'lead_ads' ||
      (lead.source === 'landing_page' && lead.consent_given_at !== null)

    if (includeEmail) {
      // Descriptografar em memória → SHA256 → descartar plaintext imediatamente.
      const emailPlaintext = decryptToken(lead.email_encrypted, encryptionKey)
      userData.em = [sha256Hex(emailPlaintext)]
      // emailPlaintext sai de escopo aqui — nunca gravado, nunca logado.
    }
  }

  // lead_id: sinal forte de deduplicação Meta, só para leads vindos de Lead Ads.
  if (lead.source === 'lead_ads' && lead.meta_lead_id) {
    userData.lead_id = lead.meta_lead_id
  }

  return userData
}

/**
 * Monta o payload completo de um evento CAPI (AC 8.7.1, AC 8.7.6).
 * `event_id = lead.id` (UUID) → deduplicação Meta de 7 dias.
 */
export function buildCapiPayload(
  lead: Lead,
  eventName: CAPIEventName,
  encryptionKey: string
): CAPILeadPayload {
  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: lead.id,
    action_source: 'website',
    user_data: buildUserData(lead, encryptionKey),
  }
}

/**
 * Gate de envio CAPI (AC 8.7.3 / FR-CAPI6): verifica, ANTES de qualquer chamada Meta:
 *  - CAPI habilitada para o workspace (meta_pixel_id presente; e, se a coluna existir,
 *    meta_conversions_api_enabled !== false);
 *  - conta de anúncio com token não expirado (status != 'expired').
 *
 * Não satisfeito → { enabled: false, skipReason } (decisão explícita auditável, não erro).
 *
 * @param adAccountId conta de anúncio do lead, ou null (lead sem conta → só checa pixel).
 */
export async function checkCAPIGate(
  workspaceId: string,
  adAccountId: string | null,
  supabase: AnySupabase,
  encryptionKey: string
): Promise<CapiGateResult> {
  // Gap de schema documentado: a coluna `meta_conversions_api_enabled` NÃO existe no
  // schema aplicado. Selecioná-la diretamente faria o PostgREST retornar erro (coluna
  // inexistente) e quebraria o gate. Por isso selecionamos `*` e lemos a flag de forma
  // defensiva: se a coluna existir num schema futuro e estiver `false`, bloqueia; se não
  // existir (hoje), `meta_pixel_id` presente é o sinal operativo de "CAPI habilitada".
  const { data: ws } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const settings = ws as
    | { meta_pixel_id: string | null; meta_conversions_api_enabled?: boolean | null }
    | null

  if (settings?.meta_conversions_api_enabled === false) {
    return { enabled: false, skipReason: 'capi_disabled' }
  }
  if (!settings?.meta_pixel_id) {
    return { enabled: false, skipReason: 'no_pixel_id' }
  }
  const pixelId = settings.meta_pixel_id

  // Sem conta de anúncio: não há token para descriptografar (caminho landing_page sem
  // ad_account). O envio fica habilitado mas sem token — o caller decide se segue.
  if (!adAccountId) {
    return { enabled: true, pixelId, skipReason: undefined }
  }

  const { data: acc } = await supabase
    .from('ad_accounts')
    .select('encrypted_token, status')
    .eq('id', adAccountId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const account = acc as { encrypted_token: string; status: string } | null
  if (!account) {
    return { enabled: false, pixelId, skipReason: 'ad_account_not_found' }
  }
  if (account.status === 'expired') {
    return { enabled: false, pixelId, skipReason: 'token_expired' }
  }

  let token: string
  try {
    token = decryptToken(account.encrypted_token, encryptionKey)
  } catch {
    // Token corrompido/inválido → não enviar (sem logar o ciphertext).
    return { enabled: false, pixelId, skipReason: 'token_decrypt_failed' }
  }

  return { enabled: true, pixelId, token }
}

/**
 * Verifica se a tabela `conversion_events` existe no schema atual. A tabela pertence a
 * um epic futuro (ver migration 000009); enquanto não existir, a persistência de
 * auditoria é deferida (AC 8.7.4 pendente de migration futura — confirmado por AC 8.7.7
 * que não há nova migration nesta story).
 */
async function conversionEventsExists(supabase: AnySupabase): Promise<boolean> {
  const { error } = await supabase
    .from('conversion_events')
    .select('id', { head: true, count: 'exact' })
    .limit(1)
  // PGRST205 (PostgREST) / 42P01 (Postgres) = relação inexistente.
  if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
    return false
  }
  return true
}

/**
 * Registra (ou tenta registrar) um evento em `conversion_events` com `status='pending'`
 * ANTES da chamada Meta (AC 8.7.4). Retorna o id do registro, ou null se a tabela não
 * existir ainda (persistência deferida).
 */
async function insertPendingEvent(
  supabase: AnySupabase,
  workspaceId: string,
  lead: Lead,
  eventName: CAPIEventName
): Promise<string | null> {
  if (!(await conversionEventsExists(supabase))) return null

  const { data, error } = await supabase
    .from('conversion_events')
    .insert({
      workspace_id: workspaceId,
      event_name: eventName,
      event_id: lead.id,
      status: 'pending' satisfies ConversionEventStatus,
      // lead_id referenciado via metadata (FK pode não existir no schema futuro).
      metadata: { lead_id: lead.id, source: lead.source },
    })
    .select('id')
    .single()

  if (error) return null
  return (data as { id: string }).id
}

/**
 * Registra um evento `skipped` em `conversion_events` para auditoria (AC 8.7.3), ou
 * apenas loga o skip se a tabela ainda não existir.
 */
async function recordSkipped(
  supabase: AnySupabase,
  workspaceId: string,
  lead: Lead,
  eventName: CAPIEventName,
  skipReason: string
): Promise<void> {
  if (!(await conversionEventsExists(supabase))) {
    console.warn('[CAPI skip]', eventName, lead.id, skipReason)
    return
  }
  await supabase.from('conversion_events').insert({
    workspace_id: workspaceId,
    event_name: eventName,
    event_id: lead.id,
    status: 'skipped' satisfies ConversionEventStatus,
    error_message: skipReason,
    metadata: { lead_id: lead.id, source: lead.source },
  })
}

/** UPDATE do registro pending para sent/failed após a resposta Meta (AC 8.7.4). */
async function finalizeEvent(
  supabase: AnySupabase,
  eventRowId: string | null,
  status: 'sent' | 'failed',
  errorMessage?: string
): Promise<void> {
  if (!eventRowId) return
  await supabase
    .from('conversion_events')
    .update({
      status: status satisfies ConversionEventStatus,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    })
    .eq('id', eventRowId)
}

/** POST do payload à Graph API (AC 8.7.6). Retorna sucesso + mensagem (sem PII). */
async function postToMeta(
  pixelId: string,
  token: string,
  payload: CAPILeadPayload
): Promise<{ ok: boolean; message: string }> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${token}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [payload],
        ...(process.env.META_TEST_EVENT_CODE
          ? { test_event_code: process.env.META_TEST_EVENT_CODE }
          : {}),
      }),
    })
  } catch (err) {
    return { ok: false, message: `network_error: ${(err as Error).message}` }
  }

  if (!res.ok) {
    // Não logar o corpo bruto (pode ecoar dados); extrair só a mensagem da Meta.
    let detail = `http_${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* corpo não-JSON — manter http_status */
    }
    return { ok: false, message: detail }
  }

  const body = (await res.json().catch(() => ({}))) as { events_received?: number }
  if ((body.events_received ?? 0) >= 1) {
    return { ok: true, message: 'events_received' }
  }
  return { ok: false, message: 'no_events_received' }
}

/**
 * Núcleo do disparo CAPI: gate → pending → POST → sent/failed (AC 8.7.3-8.7.6).
 * Reutilizado por `sendLeadCapi` e `sendCompleteRegistrationCapi`.
 */
async function dispatchCapi(
  lead: Lead,
  eventName: CAPIEventName,
  adAccountId: string | null,
  supabase: AnySupabase,
  encryptionKey: string
): Promise<CapiDispatchResult> {
  const gate = await checkCAPIGate(lead.workspace_id, adAccountId, supabase, encryptionKey)

  if (!gate.enabled || !gate.pixelId) {
    const reason = gate.skipReason ?? 'gate_not_satisfied'
    await recordSkipped(supabase, lead.workspace_id, lead, eventName, reason)
    return { status: 'skipped', eventName, message: reason }
  }
  // Sem token (lead sem ad_account) → não há como autenticar a chamada Meta → skip.
  if (!gate.token) {
    await recordSkipped(supabase, lead.workspace_id, lead, eventName, 'no_token')
    return { status: 'skipped', eventName, message: 'no_token' }
  }

  // AC 8.7.4: INSERT pending ANTES da chamada (no-op se a tabela não existir ainda).
  const eventRowId = await insertPendingEvent(supabase, lead.workspace_id, lead, eventName)

  const payload = buildCapiPayload(lead, eventName, encryptionKey)
  const result = await postToMeta(gate.pixelId, gate.token, payload)

  if (result.ok) {
    await finalizeEvent(supabase, eventRowId, 'sent')
    return { status: 'sent', eventName }
  }
  await finalizeEvent(supabase, eventRowId, 'failed', result.message)
  return { status: 'failed', eventName, message: result.message }
}

/**
 * Envia o evento `Lead` à Meta Conversions API (AC 8.7.1).
 *
 * @param lead linha completa de `leads`.
 * @param adAccountId conta de anúncio (para token), ou null.
 * @param supabase client server/service-role.
 * @param encryptionKey TOKEN_ENCRYPTION_KEY (hex). Default: process.env.
 */
export async function sendLeadCapi(
  lead: Lead,
  adAccountId: string | null,
  supabase: AnySupabase,
  encryptionKey: string = requireEncryptionKey()
): Promise<CapiDispatchResult> {
  return dispatchCapi(lead, 'Lead', adAccountId, supabase, encryptionKey)
}

/**
 * Envia o evento `CompleteRegistration` à Meta Conversions API quando um lead é
 * qualificado (AC 8.7.5). Mesmas regras de `user_data` por fonte de `sendLeadCapi`.
 */
export async function sendCompleteRegistrationCapi(
  lead: Lead,
  adAccountId: string | null,
  supabase: AnySupabase,
  encryptionKey: string = requireEncryptionKey()
): Promise<CapiDispatchResult> {
  return dispatchCapi(lead, 'CompleteRegistration', adAccountId, supabase, encryptionKey)
}

/** Lê TOKEN_ENCRYPTION_KEY do ambiente ou lança (nunca loga a chave). */
function requireEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY não configurada')
  return key
}
