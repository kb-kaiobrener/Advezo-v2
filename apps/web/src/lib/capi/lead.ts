import { createHash } from 'node:crypto'
import { createSupabaseServiceClient } from '@advezo/database'
import type { Lead } from '@advezo/types'
import {
  sendCompleteRegistrationCapi as sendCompleteRegistrationCapiCore,
  sendLeadCapi as sendLeadCapiCore,
} from './leads'

/**
 * Camada de compatibilidade fire-and-forget para os callers da Story 8.3/8.4.
 *
 * A implementação REAL do transporte CAPI (gate de envio, POST à Graph API, registro em
 * conversion_events) vive em `./leads.ts` (Story 8.7), trabalhando sobre a linha completa
 * de `leads`. Os callers existentes (`/api/leads/submit/route.ts`) foram escritos contra
 * assinaturas mais enxutas (input objeto / StatusCapiLead + leadId) e disparam estas
 * funções em fire-and-forget. Para não quebrá-los (Article V — sem regressão), este
 * módulo preserva as assinaturas legadas e delega ao núcleo real, re-hidratando a linha
 * de `leads` a partir do banco quando necessário.
 *
 * SEGURANÇA (inalterada): email em texto plano nunca é logado; SHA256(email) é calculado
 * em memória dentro do núcleo e nunca persistido; phone_hash já é HMAC-SHA256.
 */

export interface LeadCapiInput {
  leadId: string
  /** Email em texto plano — recebido no momento da submissão (não persistido aqui). */
  email: string | null
  /** Telefone normalizado (E.164 sem `+`). */
  normalizedPhone: string
  /** consent_given_at do lead; null → email NÃO entra no payload (LGPD). */
  consentGivenAt: string | null
  /** Identificador do formulário / evento. */
  embedTokenFormId: string
}

/** SHA256(lowercase(trim(value))) em hex — formato Meta CAPI para user_data. */
function hashForCapi(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Monta o `user_data` legado (apenas ph/em, sem descriptografia). Mantido para os testes
 * existentes da Story 8.3 — demonstra que o email só é hasheado com consentimento.
 *
 * @deprecated Story 8.7 — o caminho canônico é `buildUserData(lead)` em `./leads.ts`,
 *   que trabalha sobre a linha completa de `leads` e descriptografa `email_encrypted`.
 */
export function buildLeadCapiUserData(input: LeadCapiInput): {
  ph: string
  em?: string
} {
  const userData: { ph: string; em?: string } = {
    ph: hashForCapi(input.normalizedPhone),
  }
  if (input.consentGivenAt !== null && input.email) {
    userData.em = hashForCapi(input.email)
  }
  return userData
}

/**
 * Resolve a conta de anúncio associada ao lead (via lead_form), necessária para o token
 * Meta no gate de envio. Retorna null se o lead não tiver conta vinculada.
 */
async function resolveAdAccountId(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  lead: Lead
): Promise<string | null> {
  if (!lead.lead_form_id) return null
  const { data } = await supabase
    .from('lead_forms')
    .select('ad_account_id')
    .eq('id', lead.lead_form_id)
    .eq('workspace_id', lead.workspace_id)
    .maybeSingle()
  return (data as { ad_account_id: string | null } | null)?.ad_account_id ?? null
}

/** Re-hidrata a linha completa de `leads` a partir do id (service-role). */
async function loadLead(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  leadId: string
): Promise<Lead | null> {
  const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
  return (data as Lead | null) ?? null
}

/**
 * Dispara o evento `Lead` ao Meta CAPI (Story 8.3 — AC 8.3.7; transporte real: 8.7).
 *
 * Re-hidrata a linha de `leads` e delega ao núcleo real (`./leads.ts`). Fire-and-forget:
 * o caller captura erros via `.catch(...)`; aqui nenhum dado sensível é logado.
 */
export async function sendLeadCapi(input: LeadCapiInput): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const lead = await loadLead(supabase, input.leadId)
  if (!lead) {
    console.warn('[CAPI Lead] lead not found for dispatch:', input.leadId)
    return
  }
  const adAccountId = await resolveAdAccountId(supabase, lead)
  await sendLeadCapiCore(lead, adAccountId, supabase)
}

/**
 * Dados mínimos do lead recebidos pela Server Action de qualificação (Story 8.4).
 * Mantido para compatibilidade de assinatura; o núcleo opera sobre a linha completa.
 */
export interface StatusCapiLead {
  phone_hash: string
  email_encrypted: string | null
  consent_given_at: string | null
  client_id: string | null
}

/**
 * Dispara `CompleteRegistration` quando um lead é qualificado (Story 8.4 — AC 8.4.5).
 * Re-hidrata a linha de `leads` e delega ao núcleo real (Story 8.7).
 */
export async function sendCompleteRegistrationCapi(
  _lead: StatusCapiLead,
  leadId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const lead = await loadLead(supabase, leadId)
  if (!lead) {
    console.warn('[CAPI CompleteRegistration] lead not found for dispatch:', leadId)
    return
  }
  const adAccountId = await resolveAdAccountId(supabase, lead)
  await sendCompleteRegistrationCapiCore(lead, adAccountId, supabase)
}

/**
 * Dispara `Purchase` quando um lead é convertido (Story 8.4 — AC 8.4.5, SHOULD).
 * O evento `Purchase` para leads ainda não tem payload de valor definido nesta story;
 * por ora delega ao núcleo via CompleteRegistration-equivalente seria incorreto, então
 * mantém-se como no-op auditável até a story de conversão de leads.
 */
export async function sendPurchaseCapi(
  _lead: StatusCapiLead,
  leadId: string
): Promise<void> {
  // Story 8.7 cobre Lead + CompleteRegistration. Purchase para leads (com value/currency)
  // pertence à story de conversão de leads — fora do escopo de 8.7 (AC 8.7.1/8.7.5).
  console.warn('[CAPI Purchase] not yet implemented for leads:', leadId)
}
