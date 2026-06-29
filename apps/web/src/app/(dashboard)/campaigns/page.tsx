import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { CampaignRow } from '@/components/molecules/CampaignRow'
import { EmptyState } from '@/components/molecules/EmptyState'

type AdAccountRef = { account_name: string | null }

interface CampaignQueryRow {
  id: string
  platform: 'meta' | 'google'
  name: string | null
  status: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  ad_account_id: string
  ad_accounts: AdAccountRef | AdAccountRef[] | null
}

function accountNameOf(row: CampaignQueryRow): string {
  const ref = Array.isArray(row.ad_accounts) ? row.ad_accounts[0] : row.ad_accounts
  return ref?.account_name ?? 'Conta sem nome'
}

const PLATFORM_OPTIONS = [
  { value: '', label: 'Todas as plataformas' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'archived', label: 'Arquivada' },
  { value: 'deleted', label: 'Excluída' },
]

const selectClass =
  'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600'

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; status?: string; q?: string }>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('ad_campaigns')
    .select(
      'id, platform, name, status, daily_budget, lifetime_budget, ad_account_id, ad_accounts!inner(account_name)'
    )
    .order('name', { ascending: true })

  if (params.platform) query = query.eq('platform', params.platform)
  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('name', `%${params.q}%`)

  const { data } = await query
  const campaigns = (data ?? []) as CampaignQueryRow[]

  // Aggregate spend for the last 7 days per campaign. Reading the wall clock in
  // an async Server Component is intentional; the purity rule targets render-time
  // hooks, not request-time data fetching.
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const { data: spendData } = await supabase
    .from('campaign_metrics')
    .select('campaign_id, spend')
    .gte('date', sevenDaysAgo)

  const spendByCampaign = (spendData ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.campaign_id] = (acc[row.campaign_id] ?? 0) + Number(row.spend)
      return acc
    },
    {}
  )

  // Determine whether the workspace has any ad accounts at all — this drives
  // the empty-state copy (no accounts vs. accounts without synced campaigns).
  const hasFilters = Boolean(params.platform || params.status || params.q)
  const { count: accountCount } = await supabase
    .from('ad_accounts')
    .select('id', { count: 'exact', head: true })

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Campanhas</h1>
        <Link
          href="/campaigns/analytics"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Ver análise 4 semanas
        </Link>
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-center gap-3">
        <select name="platform" defaultValue={params.platform ?? ''} className={selectClass}>
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select name="status" defaultValue={params.status ?? ''} className={selectClass}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Buscar campanha..."
          className={`${selectClass} flex-1 min-w-[12rem]`}
        />

        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Filtrar
        </button>
      </form>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma campanha encontrada"
          subtitle={
            !accountCount
              ? 'Conecte uma conta de anúncio para sincronizar campanhas'
              : hasFilters
                ? 'Nenhuma campanha corresponde aos filtros selecionados'
                : 'Aguardando próximo sync automático (06:00 UTC)'
          }
          action={
            !accountCount
              ? { label: 'Conectar conta', href: '/settings/integrations' }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaignId={campaign.id}
              platform={campaign.platform}
              name={campaign.name ?? 'Campanha sem nome'}
              status={campaign.status ?? 'unknown'}
              budget={campaign.daily_budget ?? campaign.lifetime_budget}
              dailyBudget={campaign.daily_budget}
              spend7d={spendByCampaign[campaign.id] ?? 0}
              accountName={accountNameOf(campaign)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
