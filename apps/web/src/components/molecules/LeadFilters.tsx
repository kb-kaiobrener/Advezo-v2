import type { LeadFilterParams } from '@/types/leads-filters'

/**
 * Filtros da lista de leads (Story 8.8 — AC 8.8.3).
 *
 * Form GET nativo (mesma abordagem da página de campanhas) — os filtros viram query
 * params na URL e a página (Server Component) reaplica server-side. Sem JS necessário:
 * o submit navega com `?client_id=...&status=...&source=...&period=...`.
 *
 * Filtros: cliente (select), status (select), origem (select), período (select com
 * presets hoje / 7d / 30d). O multiselect de status do AC é simplificado para um
 * único select por status para manter o form GET nativo; a seleção "Todos" cobre o
 * caso sem filtro.
 */

interface ClientOption {
  id: string
  name: string
}

interface LeadFiltersProps {
  clients: ClientOption[]
  current: LeadFilterParams
}

const selectClass =
  'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'desqualificado', label: 'Desqualificado' },
  { value: 'convertido', label: 'Convertido' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'Todas as origens' },
  { value: 'landing_page', label: 'LP' },
  { value: 'lead_ads', label: 'Lead Ads' },
]

const PERIOD_OPTIONS = [
  { value: '', label: 'Todo o período' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
]

export function LeadFilters({ clients, current }: LeadFiltersProps) {
  return (
    <form method="GET" className="mb-6 flex flex-wrap items-center gap-3">
      <select
        name="client_id"
        defaultValue={current.client_id ?? ''}
        aria-label="Filtrar por cliente"
        className={selectClass}
      >
        <option value="">Todos os clientes</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>

      <select
        name="status"
        defaultValue={current.status ?? ''}
        aria-label="Filtrar por status"
        className={selectClass}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        name="source"
        defaultValue={current.source ?? ''}
        aria-label="Filtrar por origem"
        className={selectClass}
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        name="period"
        defaultValue={current.period ?? ''}
        aria-label="Filtrar por período"
        className={selectClass}
      >
        {PERIOD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Filtrar
      </button>
    </form>
  )
}
