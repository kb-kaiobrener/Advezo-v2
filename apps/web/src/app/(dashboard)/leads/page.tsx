import { UserPlus } from 'lucide-react'
import { decryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'
import { EmptyState } from '@/components/molecules/EmptyState'
import { LeadFilters } from '@/components/molecules/LeadFilters'
import { LeadsTable } from '@/components/molecules/LeadsTable'
import type { Lead } from '@advezo/types'
import type { LeadDisplay } from '@/types/leads'
import type { LeadFilterParams, LeadPeriod } from '@/types/leads-filters'

/**
 * Página de gestão de leads (Story 8.8 — AC 8.8.1..8.8.9).
 *
 * Server Component. O layout `(dashboard)` já garante autenticação (redirect /login
 * se não autenticado — AC 8.8.1). A RLS de `leads` por workspace é aplicada porque
 * usamos `createSupabaseServerClient()` (sessão do usuário), nunca o service-role.
 *
 * SEGURANÇA CRÍTICA (AC 8.8.4): `email_encrypted` (ciphertext) é descriptografado AQUI,
 * server-side, e o componente client recebe apenas `email` em texto claro (ou null). O
 * objeto LeadDisplay OMITE `email_encrypted` — ele nunca é serializado para o browser.
 * O email só é exibido quando `consent_given_at IS NOT NULL`.
 */

const PERIOD_TO_MS: Record<LeadPeriod, number> = {
  today: 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

interface RawSearchParams {
  client_id?: string
  status?: string
  source?: string
  period?: string
}

/** Normaliza os query params crus para o shape tipado, descartando valores inválidos. */
function parseFilters(raw: RawSearchParams): LeadFilterParams {
  const filters: LeadFilterParams = {}
  if (raw.client_id) filters.client_id = raw.client_id
  if (
    raw.status === 'novo' ||
    raw.status === 'qualificado' ||
    raw.status === 'desqualificado' ||
    raw.status === 'convertido'
  ) {
    filters.status = raw.status
  }
  if (raw.source === 'landing_page' || raw.source === 'lead_ads') {
    filters.source = raw.source
  }
  if (raw.period === 'today' || raw.period === '7d' || raw.period === '30d') {
    filters.period = raw.period
  }
  return filters
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const raw = await searchParams
  const filters = parseFilters(raw)
  const supabase = await createSupabaseServerClient()

  // Lista de clientes do workspace para o filtro (RLS aplica isolamento).
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true })
  const clients = (clientRows ?? []) as { id: string; name: string }[]

  // Query de leads com filtros server-side. Ordenação padrão created_at DESC (AC 8.8.2).
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.client_id) query = query.eq('client_id', filters.client_id)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.period) {
    // eslint-disable-next-line react-hooks/purity -- request-time data fetch, not render
    const since = new Date(Date.now() - PERIOD_TO_MS[filters.period]).toISOString()
    query = query.gte('created_at', since)
  }

  const { data: leadRows } = await query
  const leads = (leadRows ?? []) as Lead[]

  // Status CAPI por lead (AC 8.8.8). conversion_events pode não existir ainda (epic
  // futuro): a query degrada graciosamente — se erro/tabela ausente, capiSent = null.
  const capiByLead = await loadCapiStatus(
    supabase,
    leads.map((l) => l.id)
  )

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY

  // AC 8.8.4: descriptografia server-side; email_encrypted NUNCA enviado ao browser.
  const display: LeadDisplay[] = leads.map((lead) => {
    const { email_encrypted, ...rest } = lead
    let email: string | null = null
    if (email_encrypted && lead.consent_given_at && encryptionKey) {
      try {
        email = decryptToken(email_encrypted, encryptionKey)
      } catch {
        // Falha de descriptografia não vaza ciphertext nem quebra a página.
        email = null
      }
    }
    return {
      ...rest,
      email,
      // capiByLead === null → fonte indisponível (tabela ausente) → null para todos.
      // Caso contrário, ausência no Map = nenhum evento Lead enviado → false.
      capiSent: capiByLead === null ? null : capiByLead.get(lead.id) ?? false,
    }
  })

  const hasFilters = Object.keys(filters).length > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Leads</h1>
      </div>

      <LeadFilters clients={clients} current={filters} />

      {display.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Nenhum lead encontrado"
          subtitle={
            hasFilters
              ? 'Nenhum lead corresponde aos filtros selecionados'
              : 'Crie um formulário de captura ou configure sua integração com Lead Ads'
          }
          action={
            hasFilters
              ? undefined
              : { label: 'Configurar integrações', href: '/settings/integrations' }
          }
        />
      ) : (
        <LeadsTable leads={display} />
      )}
    </div>
  )
}

/**
 * Mapeia leadId → CAPI enviado (evento `Lead` com status='sent'). Resiliente à ausência
 * da tabela `conversion_events` (epic futuro): em caso de erro/tabela ausente, retorna
 * `null` (fonte indisponível → capiSent = null no caller). Um Map vazio significa que a
 * tabela existe mas nenhum evento `Lead` foi enviado para os leads consultados.
 */
async function loadCapiStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  leadIds: string[]
): Promise<Map<string, boolean> | null> {
  const result = new Map<string, boolean>()
  if (leadIds.length === 0) return result

  const { data, error } = await supabase
    .from('conversion_events')
    .select('lead_id, status, event_name')
    .in('lead_id', leadIds)
    .eq('event_name', 'Lead')

  // Tabela ausente / qualquer erro → indisponível.
  if (error || !data) return null

  for (const row of data as { lead_id: string; status: string }[]) {
    if (row.status === 'sent') result.set(row.lead_id, true)
    else if (!result.has(row.lead_id)) result.set(row.lead_id, false)
  }
  return result
}
