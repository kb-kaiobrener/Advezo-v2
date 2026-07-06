import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createSupabaseServiceClient } from '@advezo/database'
import {
  AVAILABLE_METRICS,
  formatMetricValue,
  isMetricKey,
  type MetricKey,
  type MetricTotals,
} from '@/lib/dashboard/metrics'
import { aggregateMetrics } from '@/lib/whatsapp/report-generator'

// ISR real — 5 min. Funciona porque o gate de senha vive no middleware (proxy.ts),
// então este Server Component nunca chama cookies() e permanece estático/cacheável (AC 3.7.8).
export const revalidate = 300

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = createSupabaseServiceClient() // NUNCA exposta ao browser (NFR-2)

  const { data: config } = await db
    .from('dashboard_configs')
    .select('*, clients(name)')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!config) notFound()

  // O middleware (proxy.ts) já validou a senha antes de chegar aqui — nada de cookies() nesta rota.

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // Agregação server-side: ad_accounts → ad_campaigns → campaign_metrics (mesmo caminho da Story 3.4).
  const { data: accounts } = await db
    .from('ad_accounts')
    .select('id')
    .eq('client_id', config.client_id)
    .eq('workspace_id', config.workspace_id)

  const accountIds = (accounts ?? []).map((a) => a.id)

  let totals: MetricTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
  let syncedAt: string | null = null

  if (accountIds.length > 0) {
    const { data: campaigns } = await db
      .from('ad_campaigns')
      .select('id')
      .in('ad_account_id', accountIds)
      .eq('workspace_id', config.workspace_id)

    const campaignIds = (campaigns ?? []).map((c) => c.id)

    if (campaignIds.length > 0) {
      const { data: metrics } = await db
        .from('campaign_metrics')
        .select('spend, impressions, clicks, conversions, revenue, synced_at')
        .in('campaign_id', campaignIds)
        .gte('date', start)
        .lte('date', end)

      if (metrics?.length) {
        totals = aggregateMetrics(metrics)
        syncedAt = metrics.reduce<string | null>((latest, m) => {
          const s = (m as { synced_at: string | null }).synced_at
          if (!s) return latest
          return !latest || s > latest ? s : latest
        }, null)
      }
    }
  }

  const selectedMetrics: MetricKey[] = (config.selected_metrics as string[])
    .filter(isMetricKey)
  const displayMetrics = selectedMetrics.length > 0
    ? selectedMetrics
    : (AVAILABLE_METRICS.filter((m) => ['spend', 'impressions', 'clicks'].includes(m.key)).map((m) => m.key) as MetricKey[])

  const clientName = (config.clients as { name: string } | null)?.name ?? 'Cliente'
  const periodLabel = `${MONTHS_PT[now.getMonth()]} de ${now.getFullYear()}`

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-2xl font-semibold">{clientName}</h1>
            <p className="text-sm text-neutral-500">Relatório de desempenho — {periodLabel}</p>
          </div>
          {config.logo_url && (
            <Image
              src={config.logo_url}
              alt="Logo da agência"
              width={120}
              height={48}
              className="h-12 w-auto object-contain"
              priority
            />
          )}
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayMetrics.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {AVAILABLE_METRICS.find((m) => m.key === key)?.label ?? key}
              </p>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">
                {formatMetricValue(key, totals)}
              </p>
            </div>
          ))}
        </section>

        <footer className="mt-10 text-center text-xs text-neutral-400">
          <p>Última atualização: {formatUpdatedAt(syncedAt)}</p>
          <p className="mt-1">Gerado por Advezo</p>
        </footer>
      </div>
    </main>
  )
}
