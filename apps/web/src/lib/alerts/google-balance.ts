/**
 * Busca de saldo de conta Google Ads (Story 2.9 — CP5).
 *
 * CP5: saldo via chamada REAL à Google Ads API (recurso account_budget), NÃO derivado
 * de daily_budget local. Mantém GOOGLE_ADS_API_BASE v17 e o mesmo formato de headers
 * (Authorization Bearer + developer-token) de lib/sync/google.ts.
 *
 * GAQL (account_budget, status APPROVED):
 *   approved_spending_limit_micros - amount_served_micros = saldo restante (micros).
 *   Dividir por 1_000_000 para BRL. Quando há mais de um budget aprovado, somamos os
 *   saldos remanescentes (uma conta pode ter budgets sucessivos).
 *
 * Falhas PROPAGAM como Error — o caller (cron) registra em sync_errors com
 * error_type='alert_detection_failed' e segue. Token nunca aparece na mensagem.
 */

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v17'

export const GOOGLE_ACCOUNT_BUDGET_GAQL = `SELECT account_budget.amount_served_micros, account_budget.total_adjustments_micros, account_budget.approved_spending_limit_micros FROM account_budget WHERE account_budget.status = 'APPROVED'`

interface AccountBudgetRow {
  accountBudget?: {
    amountServedMicros?: string | number
    totalAdjustmentsMicros?: string | number
    approvedSpendingLimitMicros?: string | number
  }
}

interface GoogleSearchResponse {
  results?: AccountBudgetRow[]
  error?: { message?: string }
}

/**
 * Retorna o saldo disponível da conta Google em BRL (reais).
 *
 * @param customerId  external_account_id (sem hífens, normalizado pelo caller).
 * @param accessToken access_token JÁ descriptografado (responsabilidade do caller).
 */
export async function fetchGoogleBalance(
  customerId: string,
  accessToken: string
): Promise<number> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN não configurada')
  }

  const res = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId.replace(/-/g, '')}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: GOOGLE_ACCOUNT_BUDGET_GAQL }),
    }
  )

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GoogleSearchResponse
    throw new Error(
      body.error?.message ?? `Google account_budget API error (HTTP ${res.status})`
    )
  }

  const body = (await res.json()) as GoogleSearchResponse

  // Soma o saldo remanescente (limite aprovado - servido) de cada budget aprovado.
  let remainingMicros = 0
  for (const row of body.results ?? []) {
    const ab = row.accountBudget ?? {}
    const approved = Number(ab.approvedSpendingLimitMicros ?? 0)
    const served = Number(ab.amountServedMicros ?? 0)
    if (!Number.isFinite(approved) || !Number.isFinite(served)) continue
    remainingMicros += approved - served
  }

  // micros → BRL. Saldo negativo (servido > aprovado) vira 0 — projeção tratará como
  // saldo esgotado (calculateProjectedDays(..., 0) === 0 → alerta imediato).
  return Math.max(0, remainingMicros) / 1_000_000
}
