import { decryptToken } from '@advezo/utils'
import type { createSupabaseServerClient } from '@advezo/database'
import { fetchMetaBalance } from './meta-balance'
import { fetchGoogleBalance } from './google-balance'
import {
  ALERT_THRESHOLD_DAYS,
  averageDailySpend,
  calculateProjectedDays,
  shouldAlert,
  shouldResolve,
} from './balance'

/**
 * Detecção de saldo baixo por conta (Story 2.9 — T2/T3 / AC 2.9.1-2.9.3 / 2.9.6).
 *
 * `detectAccountBalance(account, supabase)` processa UMA conta:
 *   1. Descriptografa o token e busca o SALDO REAL na plataforma (CP5: Meta `balance`
 *      / Google account_budget — NÃO usa daily_budget local).
 *   2. Calcula avg_daily_spend dos últimos 7 dias (campaign_metrics) e projected_days.
 *   3. Se projected_days < threshold → cria alerta (dedup garantida pelo índice único
 *      parcial do banco — CP4: capturamos o erro 23505 sem propagar nem duplicar).
 *   4. Se há alerta ativo e projected_days >= 2x threshold → resolve (AC 2.9.6a).
 *
 * RESILIÊNCIA (AC 2.9.3 / requisito explícito do QA): QUALQUER falha (token, API de
 * saldo indisponível, erro de cálculo) é registrada em sync_errors com
 * error_type='alert_detection_failed' e a função RETORNA um resultado de erro —
 * NUNCA lança exceção. O caller (cron) itera todas as contas; uma conta com falha
 * não interrompe o lote. Token descriptografado nunca entra em log/mensagem.
 */

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface AlertAccount {
  id: string
  workspace_id: string
  platform: 'meta' | 'google'
  external_account_id: string
  encrypted_token: string
}

export interface DetectResult {
  accountId: string
  ok: boolean
  /** 'created' | 'resolved' | 'none' quando ok; undefined em erro. */
  action?: 'created' | 'resolved' | 'none'
  projectedDays?: number
  error?: string
}

/** Janela de spend (últimos N dias, default 7) → YYYY-MM-DD inicial. */
function windowStartDate(windowDays = 7): string {
  const d = new Date()
  d.setDate(d.getDate() - windowDays)
  return d.toISOString().split('T')[0]
}

/** Busca o saldo real conforme a plataforma (CP5). Propaga Error em falha. */
async function fetchBalance(
  account: AlertAccount,
  accessToken: string
): Promise<number> {
  if (account.platform === 'meta') {
    return fetchMetaBalance(account.external_account_id, accessToken)
  }
  // Em sandbox, a conta de teste sobrepõe (paridade com lib/sync/google.ts).
  const customerId =
    process.env.GOOGLE_ADS_TEST_CUSTOMER_ID ?? account.external_account_id
  return fetchGoogleBalance(customerId, accessToken)
}

/** Registra a falha em sync_errors (NFR-4) — nunca propaga. */
async function recordDetectionFailure(
  supabase: SupabaseClient,
  account: AlertAccount,
  message: string
): Promise<void> {
  await supabase.from('sync_errors').insert({
    workspace_id: account.workspace_id,
    ad_account_id: account.id,
    platform: account.platform,
    error_type: 'alert_detection_failed',
    error_message: message,
  })
}

export async function detectAccountBalance(
  account: AlertAccount,
  supabase: SupabaseClient
): Promise<DetectResult> {
  try {
    // 1. Token + saldo real na plataforma (CP5).
    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw new Error('TOKEN_ENCRYPTION_KEY não configurada')
    }
    const accessToken = decryptToken(account.encrypted_token, encryptionKey)
    const availableBudget = await fetchBalance(account, accessToken)

    // 2. avg_daily_spend dos últimos 7 dias, ESCOPADO POR CONTA (AC 2.9.1).
    //    campaign_metrics.campaign_id → ad_campaigns.ad_account_id. O embed !inner com
    //    .eq('ad_campaigns.ad_account_id', ...) filtra apenas as métricas das campanhas
    //    DESTA conta — a projeção reflete o ritmo de gasto da conta, não do workspace.
    const { data: metrics, error: metricsError } = await supabase
      .from('campaign_metrics')
      .select('spend, ad_campaigns!inner(ad_account_id)')
      .eq('ad_campaigns.ad_account_id', account.id)
      .gte('date', windowStartDate(7))

    if (metricsError) {
      throw new Error(`Falha ao ler métricas: ${metricsError.message}`)
    }

    const spends = (metrics ?? []).map((m) => Number((m as { spend: number }).spend))
    const avgDailySpend = averageDailySpend(spends, 7)
    const projectedDays = calculateProjectedDays(avgDailySpend, availableBudget)

    // 3/4. Decidir criar / resolver / nada.
    const { data: activeAlert } = await supabase
      .from('alerts')
      .select('id')
      .eq('ad_account_id', account.id)
      .eq('alert_type', 'low_balance')
      .is('resolved_at', null)
      .maybeSingle()

    // 4. Resolução automática (AC 2.9.6a): alerta ativo + projeção recuperada.
    if (activeAlert && shouldResolve(projectedDays)) {
      await supabase
        .from('alerts')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', (activeAlert as { id: string }).id)
      return { accountId: account.id, ok: true, action: 'resolved', projectedDays }
    }

    // 3. Criação de alerta (AC 2.9.1) — só quando ainda não há alerta ativo.
    if (!activeAlert && shouldAlert(projectedDays)) {
      const { error: insertError } = await supabase.from('alerts').insert({
        workspace_id: account.workspace_id,
        ad_account_id: account.id,
        alert_type: 'low_balance',
        threshold_days: ALERT_THRESHOLD_DAYS,
        projected_days: projectedDays,
      })

      // CP4: o índice único parcial é a fonte de verdade da deduplicação. Se um
      // INSERT concorrente já criou o alerta ativo, o banco rejeita com 23505
      // (unique_violation) — tratamos como "já existe", sem propagar nem duplicar.
      if (insertError) {
        if (isUniqueViolation(insertError)) {
          return { accountId: account.id, ok: true, action: 'none', projectedDays }
        }
        throw new Error(`Falha ao inserir alerta: ${insertError.message}`)
      }
      return { accountId: account.id, ok: true, action: 'created', projectedDays }
    }

    return { accountId: account.id, ok: true, action: 'none', projectedDays }
  } catch (err) {
    // AC 2.9.3: falha NUNCA silenciosa e NUNCA propaga — registra e devolve erro.
    const message = err instanceof Error ? err.message : 'Erro desconhecido na detecção'
    try {
      await recordDetectionFailure(supabase, account, message)
    } catch {
      // Se até o registro do erro falhar, não há mais o que fazer aqui — o caller
      // ainda recebe ok:false e segue para a próxima conta (loop não para).
    }
    return { accountId: account.id, ok: false, error: message }
  }
}

/**
 * Identifica a violação do índice único parcial (CP4). O PostgREST/Supabase devolve
 * `code: '23505'` (unique_violation do Postgres). Mantemos um fallback textual para
 * robustez entre versões do driver.
 */
function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('alerts_active_unique')
}
