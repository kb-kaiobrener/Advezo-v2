import type { Lead, LeadSource, LeadStatus } from '@advezo/types'

/**
 * Shape seguro de Lead para a UI (Story 8.8 — AC 8.8.4).
 *
 * SEGURANÇA CRÍTICA: omite `email_encrypted` (ciphertext) — ele NUNCA pode chegar ao
 * browser. No lugar, carrega `email` já descriptografado server-side (string em texto
 * claro) OU null (lead sem consentimento / sem email). A descriptografia ocorre
 * exclusivamente no Server Component da página `/leads`.
 *
 * `capiSent`: reflete se o evento `Lead` foi enviado à Meta Conversions API
 * (conversion_events.status='sent'). É `null` quando a informação é indisponível —
 * notadamente quando a tabela `conversion_events` ainda não existe (epic futuro):
 * a query é resiliente e degrada para `null` em vez de quebrar a página (AC 8.8.8).
 */
export type LeadDisplay = Omit<Lead, 'email_encrypted'> & {
  email: string | null
  capiSent: boolean | null
}

export type { LeadSource, LeadStatus }
