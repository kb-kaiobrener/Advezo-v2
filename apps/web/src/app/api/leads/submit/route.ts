import { createHmac } from 'node:crypto'
import { encryptToken, normalizePhone } from '@advezo/utils'
import { createSupabaseServiceClient } from '@advezo/database'
import { leadSubmitSchema } from '@/lib/validation/lead-submit'
import { sendCompleteRegistrationCapi, sendLeadCapi } from '@/lib/capi/lead'
import { evaluateQualificationRules } from '@/lib/leads/qualification'

/**
 * POST /api/leads/submit — submissão pública de formulário de landing page (Story 8.3).
 *
 * Endpoint PÚBLICO, sem JWT: autenticado pelo `embed_token` no body. Embed em domínio
 * de terceiros → CORS aberto (AC 8.3.1). A segurança vem de:
 *   - embed_token (128 bits, não-adivinhável) — identifica o lead_form;
 *   - rate limit server-side (IP + token) — AC 8.3.4;
 *   - gate de consentimento LGPD — AC 8.3.3.
 *
 * Sem sessão de usuário, `auth_workspace_id()` é NULL e as policies RLS bloqueariam
 * tudo. Usamos `createSupabaseServiceClient()` (service-role, ignora RLS) e escopamos
 * TODA query por workspace_id explicitamente — mesmo modelo dos endpoints de cron
 * (ARCH-1, Story 2.3).
 *
 * SEGURANÇA:
 *  - email em texto plano: nunca logado, nunca em response de erro.
 *  - email_encrypted: AES-256-GCM (encryptToken) — só quando consent === true.
 *  - phone_hash: HMAC-SHA256 com workspace_salt — NÃO SHA256 simples.
 *  - SHA256(email) para CAPI: em memória no dispatch, nunca persistido como coluna.
 *  - embed_token: nunca logado.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/** Rate limit (AC 8.3.4). */
const MAX_PER_IP_PER_HOUR = 5
const MAX_PER_TOKEN_PER_DAY = 100
const ONE_HOUR_MS = 3_600_000
const ONE_DAY_MS = 86_400_000

/** Preflight CORS — AC 8.3.1. */
export function OPTIONS(): Response {
  return new Response(null, { status: 200, headers: corsHeaders })
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

/**
 * Extrai o IP do cliente dos headers de proxy. Usado APENAS para rate limit por IP;
 * armazenado em field_data._ip (chave interna, não exibida na UI — não há coluna
 * ip_address em `leads`).
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: Request): Promise<Response> {
  // 1. Parse do body (entrada não-confiável).
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // 2. Validação Zod (AC 8.3.8) — shape inválido → 422 com detalhes por campo.
  const parsed = leadSubmitSchema.safeParse(rawBody)
  if (!parsed.success) {
    return json(
      { error: 'validation_error', fields: parsed.error.flatten().fieldErrors },
      422
    )
  }
  const body = parsed.data

  // 3. [AC 8.3.3 — CRÍTICO] GATE DE CONSENTIMENTO LGPD.
  //    Rejeição ATIVA, ANTES de qualquer processamento de dado (sem hash, sem
  //    encrypt, sem lookup-driven INSERT). email presente sem consent === true → 422.
  //    NUNCA "aceitar e ignorar o email".
  const hasEmail = !!body.email
  const hasConsent = body.consent === true
  if (hasEmail && !hasConsent) {
    return json(
      {
        error:
          'Consentimento obrigatório para compartilhamento de email (LGPD Art. 7º I)',
      },
      422
    )
  }

  const supabase = createSupabaseServiceClient()

  // 4. [AC 8.3.2] Validação do embed_token: lookup em lead_forms.
  const { data: leadForm, error: formError } = await supabase
    .from('lead_forms')
    .select('id, workspace_id, client_id, is_active, qualification_rules')
    .eq('embed_token', body.embed_token)
    .maybeSingle()

  if (formError) {
    return json({ error: 'internal_error' }, 500)
  }
  if (!leadForm) {
    // Token não encontrado → 401 (não logar o token).
    return json({ error: 'invalid_embed_token' }, 401)
  }
  if (!leadForm.is_active) {
    // Formulário desativado → 410 Gone.
    return json({ error: 'form_inactive' }, 410)
  }

  // 5. [AC 8.3.4] Rate limit via Supabase count (sem Redis).
  const ip = clientIp(request)
  const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS).toISOString()
  const oneDayAgo = new Date(Date.now() - ONE_DAY_MS).toISOString()

  // Por IP: 5/hora (filtrado por field_data._ip — não há coluna ip_address).
  const { count: ipCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', leadForm.workspace_id)
    .eq('source', 'landing_page')
    .eq('field_data->>_ip', ip)
    .gte('created_at', oneHourAgo)

  if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
    return json({ error: 'rate_limited' }, 429)
  }

  // Por embed_token (lead_form_id): 100/dia.
  const { count: tokenCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', leadForm.workspace_id)
    .eq('lead_form_id', leadForm.id)
    .gte('created_at', oneDayAgo)

  if ((tokenCount ?? 0) >= MAX_PER_TOKEN_PER_DAY) {
    return json({ error: 'rate_limited' }, 429)
  }

  // 6. [AC 8.3.5] Processamento de dados.
  //    workspace_salt: não há coluna `salt` em workspaces → usa workspace_id como salt
  //    (AUTO-DECISION, documentada na story). HMAC-SHA256, NÃO SHA256 simples.
  const workspaceSalt = leadForm.workspace_id
  const normalizedPhone = normalizePhone(body.phone)
  const phoneHash = createHmac('sha256', workspaceSalt)
    .update(normalizedPhone)
    .digest('hex')

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    return json({ error: 'internal_error' }, 500)
  }

  // email_encrypted e consent_given_at: SOMENTE quando consent === true.
  const nowIso = new Date().toISOString()
  const emailEncrypted =
    hasConsent && body.email ? encryptToken(body.email, encryptionKey) : null
  const consentGivenAt = hasConsent && body.email ? nowIso : null

  // field_data: campos customizados + _ip interno (para rate limit por IP).
  const fieldData: Record<string, unknown> = {
    ...(body.field_data ?? {}),
    _ip: ip,
  }

  // 7. [AC 8.3.6] INSERT com captura de 23505 (dedup) → 409 idempotente.
  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert({
      workspace_id: leadForm.workspace_id,
      client_id: leadForm.client_id,
      lead_form_id: leadForm.id,
      source: 'landing_page',
      status: 'novo',
      name: body.name,
      phone_hash: phoneHash,
      email_encrypted: emailEncrypted,
      consent_given_at: consentGivenAt,
      field_data: fieldData,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      // Violação de leads_active_dedup (client_id, phone_hash) → idempotente.
      return json({ error: 'lead_already_exists' }, 409)
    }
    // Não vazar detalhes internos na response.
    console.error('[leads/submit] insert failed:', insertError.code)
    return json({ error: 'internal_error' }, 500)
  }

  const leadId = inserted.id

  // 7b. [AC 8.4.2] Qualificação automática sincrônica: avalia as regras do formulário
  //     contra os campos do lead imediatamente após o INSERT. Se todas as regras
  //     passarem (AND-logic; array vazio → false), promove status para 'qualificado'
  //     e marca qualified_at. O UPDATE é escopado por workspace_id (service-role ignora
  //     RLS — mesmo modelo do INSERT). field_data inclui _ip interno, irrelevante para
  //     as regras configuradas pelo gestor.
  const rules = (leadForm.qualification_rules ??
    []) as Parameters<typeof evaluateQualificationRules>[1]
  const isQualified = evaluateQualificationRules(fieldData, rules)
  if (isQualified) {
    const { error: qualifyError } = await supabase
      .from('leads')
      .update({ status: 'qualificado', qualified_at: nowIso })
      .eq('id', leadId)
      .eq('workspace_id', leadForm.workspace_id)

    if (qualifyError) {
      // Não falha a submissão: o lead já existe (201). Apenas registra para diagnóstico
      // — a qualificação pode ser refeita manualmente via Server Action.
      console.error('[leads/submit] auto-qualify failed:', qualifyError.code)
    } else {
      // AC 8.4.5: → qualificado dispara CompleteRegistration (fire-and-forget).
      sendCompleteRegistrationCapi(
        {
          phone_hash: phoneHash,
          email_encrypted: emailEncrypted,
          consent_given_at: consentGivenAt,
          client_id: leadForm.client_id,
        },
        leadId
      ).catch((err) =>
        console.error('[CAPI CompleteRegistration] async dispatch failed:', err)
      )
    }
  }

  // 8. [AC 8.3.7] Disparo CAPI Lead assíncrono (fire-and-forget — não bloqueia 201).
  //    SHA256(email) é calculado em memória dentro de sendLeadCapi; nunca persistido.
  sendLeadCapi({
    leadId,
    email: body.email ?? null,
    normalizedPhone,
    consentGivenAt,
    embedTokenFormId: leadForm.id,
  }).catch((err) =>
    console.error('[CAPI Lead] async dispatch failed:', err)
  )

  // 9. 201 Created.
  return json({ lead_id: leadId }, 201)
}
