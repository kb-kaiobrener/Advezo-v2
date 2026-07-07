'use client'

import { useEffect, useState } from 'react'
import { formatMetricValue, type MetricTotals } from '@/lib/dashboard/metrics'
import type { ClienteAccountMetrics } from '@/app/api/cliente/metrics/route'

interface Props {
  clientId: string
}

const PERIODS = [7, 14, 30] as const

const HEALTH_BADGE: Record<ClienteAccountMetrics['health'], { label: string; className: string }> = {
  green: { label: 'Saudável', className: 'bg-emerald-100 text-emerald-700' },
  yellow: { label: 'Atenção', className: 'bg-amber-100 text-amber-700' },
  red: { label: 'Crítico', className: 'bg-red-100 text-red-700' },
}

const PLATFORM_LABEL: Record<string, string> = { meta: 'Meta Ads', google: 'Google Ads' }

export function ClientePanel({ clientId }: Props) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30)
  const [accounts, setAccounts] = useState<ClienteAccountMetrics[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset de estado acontece no handler do clique (handlePeriodChange) — nunca
  // sincronamente dentro do effect (regra react-hooks de cascading renders).
  // No effect, todo setState ocorre após await (assíncrono).
  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch(`/api/cliente/metrics?client_id=${clientId}&period=${period}`)
        if (cancelled) return
        if (!res.ok) {
          setError('Não foi possível carregar as métricas.')
          return
        }
        const body = (await res.json()) as { accounts: ClienteAccountMetrics[] }
        if (!cancelled) setAccounts(body.accounts)
      } catch {
        if (!cancelled) setError('Não foi possível carregar as métricas.')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [clientId, period])

  function handlePeriodChange(p: (typeof PERIODS)[number]) {
    setPeriod(p)
    setAccounts(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => handlePeriodChange(p)}
            className={
              p === period
                ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                : 'rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors'
            }
          >
            {p} dias
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && accounts === null && (
        <p className="text-sm text-muted-foreground">Carregando métricas...</p>
      )}
      {accounts?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta de anúncio vinculada ainda — fale com sua agência.
        </p>
      )}

      {accounts?.map(acc => {
        const badge = HEALTH_BADGE[acc.health]
        return (
          <div key={acc.account_id} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {acc.account_name ?? 'Conta de anúncio'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_LABEL[acc.platform] ?? acc.platform}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </div>

            <MetricGrid totals={acc.totals} />
          </div>
        )
      })}
    </div>
  )
}

function MetricGrid({ totals }: { totals: MetricTotals }) {
  const showRoas = totals.revenue > 0
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Investimento" value={formatMetricValue('spend', totals)} />
      <MetricCard label="Cliques" value={formatMetricValue('clicks', totals)} />
      <MetricCard label="Conversões" value={formatMetricValue('conversions', totals)} />
      {showRoas ? (
        <MetricCard label="ROAS" value={formatMetricValue('roas', totals)} />
      ) : (
        <MetricCard label="CPL" value={formatMetricValue('cpl', totals)} />
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
