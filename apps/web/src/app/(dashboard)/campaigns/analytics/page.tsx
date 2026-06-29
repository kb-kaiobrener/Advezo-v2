import Link from 'next/link'
import { ArrowLeft, BarChart2 } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { getWeekRanges, aggregateByWeek } from '@/lib/analytics/weekly'
import { WeeklyComparisonTable } from '@/components/molecules/WeeklyComparisonTable'
import { EmptyState } from '@/components/molecules/EmptyState'

export default async function CampaignsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()

  const weekRanges = getWeekRanges(4)
  const fourWeeksAgo = weekRanges[0].start

  // Query campaigns
  let campaignQuery = supabase
    .from('ad_campaigns')
    .select('id, name, platform')
    .order('name', { ascending: true })
  if (params.platform) campaignQuery = campaignQuery.eq('platform', params.platform)
  const { data: campaigns } = await campaignQuery

  // Query metrics for the last 4 weeks
  const { data: metricsRaw } = await supabase
    .from('campaign_metrics')
    .select('campaign_id, date, spend, revenue, conversions')
    .gte('date', fourWeeksAgo)
    .order('date', { ascending: true })

  const tableData = aggregateByWeek(metricsRaw ?? [], campaigns ?? [], weekRanges)
  const hasData = tableData.some((c) => Object.values(c.weeks).some((w) => w.spend > 0))

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <Link
          href="/campaigns"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Campanhas
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Análise — Últimas 4 Semanas</h1>
      </div>

      {/* Filtro de plataforma */}
      <form method="GET" className="flex items-center gap-3">
        <select
          name="platform"
          defaultValue={params.platform ?? ''}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Todas as plataformas</option>
          <option value="meta">Meta Ads</option>
          <option value="google">Google Ads</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
        >
          Filtrar
        </button>
      </form>

      {!hasData ? (
        <EmptyState
          icon={BarChart2}
          title="Nenhum dado disponível ainda"
          subtitle="Os dados aparecem após o primeiro sync automático (06:00 UTC)"
          action={{ label: 'Ver Campanhas', href: '/campaigns' }}
        />
      ) : (
        <WeeklyComparisonTable data={tableData} weekRanges={weekRanges} />
      )}
    </div>
  )
}
