export interface ClientMetrics {
  totalSpend: number
  totalRevenue: number
  totalClicks: number
  totalImpressions: number
  totalConversions: number
  /** Gasto da semana anterior (S-2). Ausente = sem dado histórico → tendência neutra. */
  previousSpend?: number
}

/**
 * Calcula o health score (0-100) de um cliente a partir das métricas agregadas
 * de suas campanhas (semana S-1) e da semana anterior (S-2).
 *
 * Fórmula (Story 2.6 — AC 2.6.2):
 *  - ROAS (revenue / spend): peso 50%. ROAS 0-5+ → 0-50 pts.
 *  - CTR (clicks / impressions): peso 30%. CTR 0-5% → 0-30 pts.
 *  - Tendência de gasto (S-1 vs S-2): peso 20%. Crescimento → 20 pts, queda → 0 pts,
 *    sem dado anterior → 10 pts (neutro = metade do peso).
 *
 * Sem gasto registrado (totalSpend === 0) → score 0 ("sem dados").
 */
export function calculateHealthScore(metrics: ClientMetrics): number {
  if (metrics.totalSpend === 0) return 0

  const roas = metrics.totalRevenue / metrics.totalSpend
  const ctr =
    metrics.totalImpressions > 0
      ? metrics.totalClicks / metrics.totalImpressions
      : 0

  // ROAS: peso 50% (0-5+ → 0-50)
  const roasScore = Math.min(roas / 5, 1) * 50

  // CTR: peso 30% (0-5% → 0-30)
  const ctrScore = Math.min(ctr / 0.05, 1) * 30

  // Tendência: peso 20%. Sem dado anterior → 10 pts (neutro).
  // delta positivo (spend cresceu) → mais pontos; delta negativo (spend caiu) → menos.
  // Clampar delta em [-1, 1] evita que variações extremas dominem o score.
  let trendScore = 10
  if (metrics.previousSpend !== undefined && metrics.previousSpend > 0) {
    const delta = (metrics.totalSpend - metrics.previousSpend) / metrics.previousSpend
    const normalized = Math.max(-1, Math.min(1, delta))
    trendScore = ((normalized + 1) / 2) * 20
  }

  return Math.round(roasScore + ctrScore + trendScore)
}
