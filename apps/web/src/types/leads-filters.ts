import type { LeadStatus, LeadSource } from '@advezo/types'

/**
 * Parâmetros de filtro da lista de leads (Story 8.8 — AC 8.8.3), serializados como
 * query params na URL. Todos opcionais — ausência = sem filtro.
 *
 * `period` é um preset de intervalo relativo resolvido server-side para um `gte` em
 * `created_at`.
 */
export type LeadPeriod = 'today' | '7d' | '30d'

export interface LeadFilterParams {
  client_id?: string
  status?: LeadStatus
  source?: LeadSource
  period?: LeadPeriod
}
