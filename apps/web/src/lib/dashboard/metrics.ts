import { formatBRL, formatNumber, formatPercent, formatMultiplier } from '@/lib/whatsapp/report-generator'

/** Métricas selecionáveis no dashboard compartilhável (Story 3.7 — Dev Notes). */
export const AVAILABLE_METRICS = [
  { key: 'spend',       label: 'Investimento', calculated: false },
  { key: 'impressions', label: 'Impressões',   calculated: false },
  { key: 'clicks',      label: 'Cliques',      calculated: false },
  { key: 'ctr',         label: 'CTR',          calculated: true  }, // clicks/impressions
  { key: 'conversions', label: 'Conversões',   calculated: false },
  { key: 'revenue',     label: 'Receita',      calculated: false },
  { key: 'roas',        label: 'ROAS',         calculated: true  }, // revenue/spend
  { key: 'cpl',         label: 'CPL',          calculated: true  }, // spend/conversions
] as const

export type MetricKey = (typeof AVAILABLE_METRICS)[number]['key']

const METRIC_KEYS = AVAILABLE_METRICS.map((m) => m.key) as readonly MetricKey[]

export function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as readonly string[]).includes(value)
}

export interface MetricTotals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/**
 * Calcula o valor formatado (PT-BR) de uma métrica a partir dos totais agregados.
 * Métricas calculadas (ctr/roas/cpl) protegem contra divisão por zero.
 */
export function formatMetricValue(key: MetricKey, totals: MetricTotals): string {
  switch (key) {
    case 'spend':
      return formatBRL(totals.spend)
    case 'impressions':
      return formatNumber(totals.impressions)
    case 'clicks':
      return formatNumber(totals.clicks)
    case 'conversions':
      return formatNumber(totals.conversions)
    case 'revenue':
      return formatBRL(totals.revenue)
    case 'ctr':
      return formatPercent(totals.impressions > 0 ? totals.clicks / totals.impressions : 0)
    case 'roas':
      return formatMultiplier(totals.spend > 0 ? totals.revenue / totals.spend : 0)
    case 'cpl':
      return formatBRL(totals.conversions > 0 ? totals.spend / totals.conversions : 0)
  }
}

export function metricLabel(key: MetricKey): string {
  return AVAILABLE_METRICS.find((m) => m.key === key)?.label ?? key
}
