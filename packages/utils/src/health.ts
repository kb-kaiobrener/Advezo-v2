export interface ClientMetrics {
  roas?: number
  spend?: number
  budget?: number
  // campos adicionais virão no Epic 2
}

/**
 * Calcula o health score (0-100) de um cliente a partir de suas métricas.
 *
 * Stub para Epic 1 — retorna 0 enquanto a lógica real (ponderação de ROAS,
 * pacing de budget, tendência de gasto) não é implementada no Epic 2.
 */
export function calculateHealthScore(data: ClientMetrics): number {
  if (!data.roas && !data.spend) return 0
  // Lógica real implementada no Epic 2
  return 0
}
