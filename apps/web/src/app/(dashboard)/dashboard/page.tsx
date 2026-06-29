import { Users, DollarSign, Target, TrendingUp } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { calculateHealthScore, type ClientMetrics } from '@advezo/utils'
import { DashboardFilters } from '@/components/molecules/DashboardFilters'
import { MetricCard } from '@/components/molecules/MetricCard'
import {
  ClientHealthCard,
  type ClientHealthData,
} from '@/components/molecules/ClientHealthCard'
import { EmptyState } from '@/components/molecules/EmptyState'

type MetricsAgg = ClientMetrics & { roas: number }

/**
 * Linha bruta de campaign_metrics com o join aninhado até client_id.
 * O client Supabase é não-tipado neste projeto, então a forma do join é
 * declarada manualmente e validada via cast seguro abaixo.
 */
interface MetricsRow {
  spend: number | string | null
  revenue: number | string | null
  clicks: number | null
  impressions: number | null
  conversions: number | null
  ad_campaigns: {
    ad_accounts: { client_id: string | null } | null
  } | null
}

function emptyAgg(): MetricsAgg {
  return {
    totalSpend: 0,
    totalRevenue: 0,
    totalClicks: 0,
    totalImpressions: 0,
    totalConversions: 0,
    roas: 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  // 1. Clientes ativos do workspace (RLS filtra por workspace automaticamente)
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .is('deleted_at', null)
    .order('name')

  const rows = clients ?? []

  // 2. Ranges de tempo: S-1 (últimos 7 dias) e S-2 (7 dias anteriores a S-1).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // S-1: métricas completas (ROAS, CTR, conversões)
  const { data: metricsRaw } = await supabase
    .from('campaign_metrics')
    .select(
      'spend, revenue, clicks, impressions, conversions, ad_campaigns!inner(ad_accounts!inner(client_id))',
    )
    .gte('date', sevenDaysAgo)

  // S-2: apenas spend (usado para calcular tendência de gasto — AC 2.6.2)
  const { data: prevMetricsRaw } = await supabase
    .from('campaign_metrics')
    .select('spend, ad_campaigns!inner(ad_accounts!inner(client_id))')
    .gte('date', fourteenDaysAgo)
    .lt('date', sevenDaysAgo)

  // 3. Agregar métricas S-1 por client_id
  const metricRows = (metricsRaw ?? []) as unknown as MetricsRow[]
  const metricsByClient: Record<string, MetricsAgg> = {}
  for (const m of metricRows) {
    const clientId = m.ad_campaigns?.ad_accounts?.client_id
    if (!clientId) continue
    const agg = (metricsByClient[clientId] ??= emptyAgg())
    agg.totalSpend += Number(m.spend ?? 0)
    agg.totalRevenue += Number(m.revenue ?? 0)
    agg.totalClicks += Number(m.clicks ?? 0)
    agg.totalImpressions += Number(m.impressions ?? 0)
    agg.totalConversions += Number(m.conversions ?? 0)
  }
  for (const agg of Object.values(metricsByClient)) {
    agg.roas = agg.totalSpend > 0 ? agg.totalRevenue / agg.totalSpend : 0
  }

  // Agregar spend S-2 por client_id (para tendência de gasto)
  const prevRows = (prevMetricsRaw ?? []) as unknown as Array<{
    spend: number | string | null
    ad_campaigns: { ad_accounts: { client_id: string | null } | null } | null
  }>
  const prevSpendByClient: Record<string, number> = {}
  for (const m of prevRows) {
    const clientId = m.ad_campaigns?.ad_accounts?.client_id
    if (!clientId) continue
    prevSpendByClient[clientId] = (prevSpendByClient[clientId] ?? 0) + Number(m.spend ?? 0)
  }

  // 4. Montar health data por cliente (clientes sem métricas → score 0 / "sem dados")
  const healthData: ClientHealthData[] = rows.map((client) => {
    const agg = metricsByClient[client.id] ?? emptyAgg()
    return {
      clientId: client.id,
      clientName: client.name,
      healthScore: calculateHealthScore({ ...agg, previousSpend: prevSpendByClient[client.id] }),
      roas: agg.roas,
      spend: agg.totalSpend,
      // budget não está disponível em campaign_metrics; ad_campaigns.daily_budget
      // exigiria agregação separada — fora do escopo desta story (usar 0 por ora).
      budget: 0,
    }
  })

  // 5. Totais reais agregados de todos os clientes do workspace (AC 2.6.5)
  const totals = Object.values(metricsByClient).reduce(
    (acc, agg) => {
      acc.spend += agg.totalSpend
      acc.revenue += agg.totalRevenue
      acc.conversions += agg.totalConversions
      return acc
    },
    { spend: 0, revenue: 0, conversions: 0 },
  )
  const avgRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0
  const activeClients = healthData.filter((c) => c.healthScore > 0).length

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <DashboardFilters clients={rows.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Total Investido (7d)"
          value={`R$ ${totals.spend.toFixed(2)}`}
          icon={DollarSign}
        />
        <MetricCard title="Total Conversões (7d)" value={totals.conversions} icon={Target} />
        <MetricCard title="ROAS Médio (7d)" value={`${avgRoas.toFixed(2)}x`} icon={TrendingUp} />
        <MetricCard title="Clientes Ativos" value={activeClients} icon={Users} />
      </div>

      {healthData.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ativo"
          subtitle="Cadastre clientes na seção Clientes para ver o dashboard"
          action={{ label: 'Ir para Clientes', href: '/clients' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {healthData.map((client) => (
            <ClientHealthCard key={client.clientId} data={client} />
          ))}
        </div>
      )}
    </div>
  )
}
