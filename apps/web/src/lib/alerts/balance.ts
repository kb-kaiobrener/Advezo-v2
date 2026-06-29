/**
 * Lógica pura de detecção de saldo baixo (Story 2.9 — T3 / AC 2.9.1).
 *
 * Funções determinísticas, sem I/O: recebem números e devolvem números/booleanos.
 * Toda a lógica testável da story vive aqui — o cron (route.ts) e os fetchers de
 * saldo (meta.ts/google.ts) apenas orquestram I/O em volta destas funções.
 *
 * Threshold fixo nesta story (7 dias) — configurável no Epic 3 se necessário.
 */

/** Dias de projeção abaixo dos quais alertamos (AC 2.9.1). */
export const ALERT_THRESHOLD_DAYS = 7

/**
 * Folga de resolução automática (AC 2.9.6). Quando a projeção sobe para >= 2x o
 * threshold, o alerta ativo é resolvido — a folga de 2x evita "flicker" (criar e
 * resolver o mesmo alerta em dias consecutivos por oscilação em torno do limite).
 */
export const ALERT_RESOLVE_DAYS = ALERT_THRESHOLD_DAYS * 2

/**
 * Calcula em quantos dias o saldo disponível se esgota ao ritmo de gasto atual.
 *
 * - avgDailySpend === 0 (ou negativo): a conta não gasta → sem risco de esgotar →
 *   Infinity (nunca alerta). Espelha o comportamento documentado no Dev Notes.
 * - availableBudget <= 0: saldo já esgotado → 0 dias (alerta imediato).
 */
export function calculateProjectedDays(
  avgDailySpend: number,
  availableBudget: number
): number {
  if (!Number.isFinite(avgDailySpend) || avgDailySpend <= 0) return Infinity
  if (availableBudget <= 0) return 0
  return availableBudget / avgDailySpend
}

/**
 * Média de gasto diário a partir de uma janela de spend (últimos 7 dias).
 *
 * Divide a soma do gasto pelo NÚMERO DE DIAS DA JANELA (windowDays), não pelo número
 * de linhas — assim dias sem gasto contam como 0 e não inflam a média. windowDays
 * default 7 (AC 2.9.1). Retorna 0 para janela vazia ou inválida.
 */
export function averageDailySpend(spends: number[], windowDays = 7): number {
  if (windowDays <= 0) return 0
  const total = spends.reduce((sum, s) => sum + (Number.isFinite(s) ? s : 0), 0)
  return total / windowDays
}

/** Deve alertar? Projeção estritamente abaixo do threshold (AC 2.9.1 / 2.9.8). */
export function shouldAlert(
  projectedDays: number,
  threshold = ALERT_THRESHOLD_DAYS
): boolean {
  return projectedDays < threshold
}

/**
 * Deve resolver um alerta ATIVO automaticamente? Projeção recuperou para >= a folga
 * de 2x o threshold (AC 2.9.6a). Infinity (conta parou de gastar) também resolve.
 */
export function shouldResolve(
  projectedDays: number,
  resolveDays = ALERT_RESOLVE_DAYS
): boolean {
  return projectedDays >= resolveDays
}
