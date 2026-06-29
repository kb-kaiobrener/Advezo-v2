import { decryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'
import { refreshGoogleToken } from '@/lib/oauth/google'

/**
 * Sync de campanhas e métricas Google Ads (Story 2.4 — AC 2.4.1 / 2.4.6).
 *
 * Fluxo de `syncGoogleAccount(adAccountId, workspaceId, supabaseClient?)`:
 *   1. Busca a conta e descriptografa o access_token (decryptToken(ciphertext, keyHex)).
 *   2. Chama a Google Ads API googleAds:search com GAQL segmentado por dia
 *      (segments.date), level=campaign, janela LAST_7_DAYS.
 *   3. Em 401 UNAUTHENTICATED: chama refreshGoogleToken para renovar o access_token
 *      automaticamente e repete a chamada (AC 2.4.2). Se o refresh também falhar
 *      (refresh_token revogado), grava sync_errors com error_type='refresh_token_invalid'
 *      e marca status='error' (NFR-4) — relança.
 *   4. Upsert em ad_campaigns (onConflict ad_account_id,external_campaign_id) e
 *      campaign_metrics (onConflict campaign_id,date → UPDATE em re-sync, nunca duplica).
 *   5. Sucesso → ad_accounts.last_synced_at = now(), status volta a 'active'.
 *
 * ARCH-1: o parâmetro opcional supabaseClient permite que o cron (sem sessão de
 * usuário) injete o service-role client. No caminho manual (Server Action), usa-se
 * o client cookie-based default.
 *
 * NOTA sobre refreshGoogleToken (Story 2.2): a função retorna o NOVO access_token
 * JÁ CRIPTOGRAFADO e o persiste internamente via seu próprio client cookie-based.
 * Aqui descriptografamos o retorno para usar como Bearer. No caminho de cron a
 * persistência interna do refresh pode não escrever sob RLS, mas o retry usa o token
 * em memória — o token será re-persistido no próximo sync com sessão, sem impacto
 * funcional no sync corrente.
 */

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v17'

type SyncSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Status de campanha do Google Ads → valores aceitos pelo CHECK de ad_campaigns. */
const GOOGLE_STATUS_MAP: Record<string, 'active' | 'paused' | 'deleted' | 'archived'> = {
  ENABLED: 'active',
  PAUSED: 'paused',
  REMOVED: 'deleted',
  UNKNOWN: 'archived',
  UNSPECIFIED: 'archived',
}

function mapGoogleStatus(status: string | undefined): 'active' | 'paused' | 'deleted' | 'archived' | null {
  if (!status) return null
  return GOOGLE_STATUS_MAP[status] ?? null
}

interface GoogleAdsRow {
  campaign?: { id?: string | number; name?: string; status?: string }
  metrics?: {
    impressions?: string | number
    clicks?: string | number
    costMicros?: string | number
    conversions?: string | number
    conversionsValue?: string | number
  }
  segments?: { date?: string }
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsRow[]
}

/** Erro estruturado de sync Google — distingue refresh inválido de erro de API. */
export class GoogleSyncError extends Error {
  readonly errorType: 'refresh_token_invalid' | 'api_error'

  constructor(message: string, errorType: 'refresh_token_invalid' | 'api_error') {
    super(message)
    this.name = 'GoogleSyncError'
    this.errorType = errorType
  }
}

/** GAQL com segmentação diária (segments.date popula campaign_metrics.date). */
export const GOOGLE_ADS_GAQL = `SELECT campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.cost_micros,
       metrics.conversions, metrics.conversions_value,
       segments.date
FROM campaign
WHERE segments.date DURING LAST_7_DAYS`

/** Monta a requisição googleAds:search para um customer_id. */
function buildSearchRequest(customerId: string, accessToken: string): {
  url: string
  init: RequestInit
} {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    throw new GoogleSyncError('GOOGLE_ADS_DEVELOPER_TOKEN não configurada', 'api_error')
  }

  return {
    url: `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: GOOGLE_ADS_GAQL }),
    },
  }
}

export async function syncGoogleAccount(
  adAccountId: string,
  workspaceId: string,
  supabaseClient?: SyncSupabaseClient
): Promise<void> {
  const supabase = supabaseClient ?? (await createSupabaseServerClient())

  // 1. Buscar conta + tokens criptografados.
  const { data: account, error: fetchError } = await supabase
    .from('ad_accounts')
    .select('encrypted_token, encrypted_refresh_token, external_account_id')
    .eq('id', adAccountId)
    .single()

  if (fetchError || !account) {
    throw new GoogleSyncError(`Conta ${adAccountId} não encontrada`, 'api_error')
  }

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new GoogleSyncError('TOKEN_ENCRYPTION_KEY não configurada', 'api_error')
  }

  // Em sandbox (GOOGLE_ADS_TEST_CUSTOMER_ID definido), sempre usar a conta de teste.
  const customerId = (
    process.env.GOOGLE_ADS_TEST_CUSTOMER_ID ?? account.external_account_id
  ).replace(/-/g, '') // Google customer_id na API é sem hífens.

  let accessToken = decryptToken(account.encrypted_token, encryptionKey)

  const doQuery = (token: string): Promise<Response> => {
    const { url, init } = buildSearchRequest(customerId, token)
    return fetch(url, init)
  }

  // 2. Primeira chamada.
  let res = await doQuery(accessToken)

  // 3. Auto-refresh em 401 UNAUTHENTICATED (AC 2.4.2).
  if (res.status === 401) {
    if (!account.encrypted_refresh_token) {
      await recordRefreshFailure(
        supabase,
        adAccountId,
        workspaceId,
        'Sem refresh_token armazenado — reconectar conta'
      )
      throw new GoogleSyncError(
        'Sem refresh_token armazenado — reconectar conta',
        'refresh_token_invalid'
      )
    }

    try {
      // refreshGoogleToken retorna o novo access_token JÁ CRIPTOGRAFADO.
      const newEncryptedToken = await refreshGoogleToken(
        adAccountId,
        account.encrypted_refresh_token,
        encryptionKey
      )
      accessToken = decryptToken(newEncryptedToken, encryptionKey)
      res = await doQuery(accessToken)
    } catch (refreshErr) {
      const message = refreshErr instanceof Error ? refreshErr.message : 'Refresh falhou'
      await recordRefreshFailure(supabase, adAccountId, workspaceId, message)
      throw new GoogleSyncError(message, 'refresh_token_invalid')
    }
  }

  // 4. Demais erros de API → sync_errors + status='error' (NFR-4).
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    const msg = errBody?.error?.message ?? `Google Ads API error (HTTP ${res.status})`

    await supabase.from('sync_errors').insert({
      workspace_id: workspaceId,
      ad_account_id: adAccountId,
      platform: 'google',
      error_type: 'api_error',
      error_message: msg,
    })
    await supabase
      .from('ad_accounts')
      .update({ status: 'error', error_message: msg })
      .eq('id', adAccountId)

    throw new GoogleSyncError(msg, 'api_error')
  }

  const { results } = (await res.json()) as GoogleAdsSearchResponse

  // 5. Upsert de campanhas + métricas (uma linha por campanha POR DIA via segments.date).
  for (const row of results ?? []) {
    const campaignExternalId = row.campaign?.id != null ? String(row.campaign.id) : null
    if (!campaignExternalId) continue

    const { data: campaign, error: campaignError } = await supabase
      .from('ad_campaigns')
      .upsert(
        {
          workspace_id: workspaceId,
          ad_account_id: adAccountId,
          platform: 'google',
          external_campaign_id: campaignExternalId,
          name: row.campaign?.name ?? null,
          status: mapGoogleStatus(row.campaign?.status),
        },
        { onConflict: 'ad_account_id,external_campaign_id' }
      )
      .select('id')
      .single()

    if (campaignError || !campaign) {
      throw new GoogleSyncError(
        `Falha ao gravar campanha ${campaignExternalId}: ${campaignError?.message ?? 'desconhecido'}`,
        'api_error'
      )
    }

    const metricsDate = row.segments?.date ?? new Date().toISOString().split('T')[0]
    const m = row.metrics ?? {}

    const { error: metricsError } = await supabase.from('campaign_metrics').upsert(
      {
        campaign_id: campaign.id,
        workspace_id: workspaceId,
        date: metricsDate,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        // cost_micros (micro-unidades) → valor na moeda: dividir por 1_000_000.
        spend: Number(m.costMicros ?? 0) / 1_000_000,
        conversions: Number(m.conversions ?? 0),
        revenue: Number(m.conversionsValue ?? 0),
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,date' }
    )

    if (metricsError) {
      throw new GoogleSyncError(
        `Falha ao gravar métricas de ${campaignExternalId}: ${metricsError.message}`,
        'api_error'
      )
    }
  }

  // 6. Sucesso → last_synced_at + limpar status de erro.
  await supabase
    .from('ad_accounts')
    .update({
      last_synced_at: new Date().toISOString(),
      status: 'active',
      error_message: null,
    })
    .eq('id', adAccountId)
}

/** Grava sync_errors (refresh_token_invalid) + marca a conta como 'error' (NFR-4). */
async function recordRefreshFailure(
  supabase: SyncSupabaseClient,
  adAccountId: string,
  workspaceId: string,
  message: string
): Promise<void> {
  await supabase.from('sync_errors').insert({
    workspace_id: workspaceId,
    ad_account_id: adAccountId,
    platform: 'google',
    error_type: 'refresh_token_invalid',
    error_message: message,
  })
  await supabase
    .from('ad_accounts')
    .update({
      status: 'error',
      error_message: 'Refresh token inválido — reconectar conta',
    })
    .eq('id', adAccountId)
}
