import { decryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'

/**
 * Sync de campanhas e métricas Meta Ads (Story 2.3 — AC 2.3.2 / 2.3.3).
 *
 * Fluxo de `syncMetaAccount(adAccountId, workspaceId)`:
 *   1. Busca a conta e descriptografa o token (decryptToken(ciphertext, keyHex)).
 *   2. Chama a Meta Marketing API /{ad_account_id}/insights com level=campaign,
 *      date_preset=last_7d, time_increment=1 (uma linha por campanha POR DIA — o
 *      campo `date_start` de cada linha alimenta campaign_metrics.date) e
 *      action_attribution_windows[]=7d_click (janela fixa → deduplicação consistente).
 *   3. Upsert em ad_campaigns (onConflict ad_account_id,external_campaign_id) e
 *      campaign_metrics (onConflict campaign_id,date → UPDATE em re-sync, NUNCA duplica).
 *   4. Sucesso → ad_accounts.last_synced_at = now(), status volta a 'active'.
 *      Falha  → grava sync_errors + ad_accounts.status = 'expired' | 'error'
 *               (NFR-4: falha de sync nunca é silenciosa).
 *
 * Token expirado: a Graph API responde com error.code === 190 (OAuthException) →
 * status='expired' (UI oferece reconectar). Demais erros → status='error'.
 */

const GRAPH_BASE = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v19.0'

/**
 * Ordem de prioridade para action_types de compra.
 * A Meta API retorna tipos sinônimos na mesma resposta (ex: 'purchase' e
 * 'offsite_conversion.fb_pixel_purchase' representam a MESMA conversão).
 * Soma-los causa contagem dupla — bug documentado na v1: "78 mostrado, 39 reais".
 * Solução: usar o tipo mais específico que existir, ignorar os demais.
 */
const PURCHASE_ACTION_PRIORITY = [
  'offsite_conversion.fb_pixel_purchase', // pixel-based — mais específico, preferido
  'purchase',                              // fallback — menos específico
] as const

interface MetaInsightAction {
  action_type: string
  value: string
}

interface MetaInsightRow {
  campaign_id: string
  campaign_name?: string
  date_start: string
  date_stop?: string
  impressions?: string
  clicks?: string
  spend?: string
  actions?: MetaInsightAction[]
  action_values?: MetaInsightAction[]
}

interface MetaGraphError {
  error?: { code?: number; message?: string; type?: string }
}

/**
 * Erro estruturado de sync — carrega o código da Graph API para que o caller
 * decida o status da conta (190 → expired, demais → error).
 */
export class MetaSyncError extends Error {
  readonly code?: number
  readonly isExpired: boolean

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'MetaSyncError'
    this.code = code
    this.isExpired = code === 190
  }
}

/** Monta a URL de insights por campanha, com métricas diárias (time_increment=1). */
export function buildInsightsUrl(actId: string, accessToken: string): string {
  const params = new URLSearchParams({
    level: 'campaign',
    date_preset: 'last_7d',
    time_increment: '1',
    fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions,action_values',
    'action_attribution_windows[]': '7d_click',
    access_token: accessToken,
  })
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${actId}/insights?${params.toString()}`
}

/**
 * Retorna o valor de conversão/receita usando o tipo de ação de maior prioridade.
 * Nunca soma tipos sinônimos — busca o primeiro tipo da PURCHASE_ACTION_PRIORITY
 * que estiver presente e usa seu valor exclusivamente.
 */
function pickPurchaseActionValue(actions: MetaInsightAction[] | undefined): number {
  if (!actions) return 0
  for (const preferredType of PURCHASE_ACTION_PRIORITY) {
    const match = actions.find((a) => a.action_type === preferredType)
    if (match) return Number(match.value) || 0
  }
  return 0
}

/** Busca os insights da conta na Graph API. Lança MetaSyncError em falha. */
export async function fetchMetaInsights(
  actId: string,
  accessToken: string
): Promise<MetaInsightRow[]> {
  const res = await fetch(buildInsightsUrl(actId, accessToken))

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as MetaGraphError
    throw new MetaSyncError(
      errBody?.error?.message ?? `Meta Insights API error (HTTP ${res.status})`,
      errBody?.error?.code
    )
  }

  const json = (await res.json()) as { data?: MetaInsightRow[] }
  return json.data ?? []
}

/**
 * Cliente Supabase aceito pelo sync. Pode ser o client cookie-based (Server Action,
 * com sessão de usuário) OU o service-role client (cron, sem JWT — ARCH-1). Tipamos
 * de forma estrutural para aceitar ambos sem acoplar à factory específica.
 */
type SyncSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function syncMetaAccount(
  adAccountId: string,
  workspaceId: string,
  supabaseClient?: SyncSupabaseClient
): Promise<void> {
  // ARCH-1: no caminho de cron (sem sessão), o caller injeta o service-role client.
  // No caminho manual (Server Action), mantém-se o client cookie-based default.
  const supabase = supabaseClient ?? (await createSupabaseServerClient())

  // 1. Buscar conta e descriptografar token.
  const { data: account, error: fetchError } = await supabase
    .from('ad_accounts')
    .select('encrypted_token, external_account_id')
    .eq('id', adAccountId)
    .single()

  if (fetchError || !account) {
    throw new MetaSyncError(`Conta ${adAccountId} não encontrada`)
  }

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new MetaSyncError('TOKEN_ENCRYPTION_KEY não configurada')
  }

  const accessToken = decryptToken(account.encrypted_token, encryptionKey)
  const actId = account.external_account_id // formato act_123456 (prefixo preservado na Story 2.1)

  // 2. Chamar a Meta Insights API. Falha → registrar e propagar (NFR-4).
  let insights: MetaInsightRow[]
  try {
    insights = await fetchMetaInsights(actId, accessToken)
  } catch (err) {
    const syncErr =
      err instanceof MetaSyncError
        ? err
        : new MetaSyncError(err instanceof Error ? err.message : 'Erro desconhecido')

    await supabase
      .from('ad_accounts')
      .update({
        status: syncErr.isExpired ? 'expired' : 'error',
        error_message: syncErr.message,
      })
      .eq('id', adAccountId)

    await supabase.from('sync_errors').insert({
      workspace_id: workspaceId,
      ad_account_id: adAccountId,
      platform: 'meta',
      error_type: syncErr.isExpired ? 'token_expired' : 'api_error',
      error_message: syncErr.message,
    })

    throw syncErr
  }

  // 3. Upsert de campanhas + métricas diárias.
  for (const row of insights) {
    const { data: campaign, error: campaignError } = await supabase
      .from('ad_campaigns')
      .upsert(
        {
          workspace_id: workspaceId,
          ad_account_id: adAccountId,
          platform: 'meta',
          external_campaign_id: row.campaign_id,
          name: row.campaign_name ?? null,
        },
        { onConflict: 'ad_account_id,external_campaign_id' }
      )
      .select('id')
      .single()

    if (campaignError || !campaign) {
      throw new MetaSyncError(
        `Falha ao gravar campanha ${row.campaign_id}: ${campaignError?.message ?? 'desconhecido'}`
      )
    }

    const conversions = pickPurchaseActionValue(row.actions)
    const revenue = pickPurchaseActionValue(row.action_values)

    // Deduplicação: onConflict (campaign_id, date) → UPDATE no re-sync, nunca duplica.
    const { error: metricsError } = await supabase.from('campaign_metrics').upsert(
      {
        campaign_id: campaign.id,
        workspace_id: workspaceId,
        date: row.date_start,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        spend: Number(row.spend ?? 0),
        conversions,
        revenue,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,date' }
    )

    if (metricsError) {
      throw new MetaSyncError(
        `Falha ao gravar métricas de ${row.campaign_id}: ${metricsError.message}`
      )
    }
  }

  // 4. Sucesso → atualizar last_synced_at e limpar status de erro anterior.
  await supabase
    .from('ad_accounts')
    .update({
      last_synced_at: new Date().toISOString(),
      status: 'active',
      error_message: null,
    })
    .eq('id', adAccountId)
}
