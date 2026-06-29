'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { decryptToken } from '@advezo/utils'
import {
  metaPauseCampaign,
  metaActivateCampaign,
  metaUpdateBudget,
  type PlatformActionResult,
} from '@/lib/platform/meta-campaigns'
import {
  googlePauseCampaign,
  googleActivateCampaign,
  googleUpdateBudget,
} from '@/lib/platform/google-campaigns'
import { refreshGoogleToken } from '@/lib/oauth/google'

/**
 * Server Actions de ações inline em campanhas (Story 2.7).
 *
 * Mutação financeira REAL: pausar/ativar campanha e ajustar orçamento diário direto
 * na API da Meta/Google. Fluxo aprovado no checkpoint (CP1):
 *   1. auth guard → ownership (ad_campaign pertence ao workspace, via workspace_id).
 *   2. INSERT action_log { status: 'pending', ... } ANTES da chamada à API.
 *   3. PATCH/POST na API externa (Meta ou Google).
 *   4a. API 2xx  → UPDATE action_log status='success' + UPDATE ad_campaigns.
 *   4b. API erro → UPDATE action_log status='failed', api_error=msg.
 *                  NÃO toca ad_campaigns — estado local preservado (AC 2.7.3 / 2.7.8).
 *
 * CP3: sem estado otimista. A UI só reflete o novo estado após revalidatePath
 * confirmar o que o banco tem. Tokens descriptografados NUNCA aparecem em logs ou
 * em mensagens de erro retornadas ao cliente.
 */

async function getAuthenticatedWorkspace() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  return { supabase, user, workspaceId: membership.workspace_id }
}

interface AdAccountRef {
  id: string
  encrypted_token: string
  encrypted_refresh_token: string | null
  external_account_id: string
  workspace_id: string
}

interface CampaignWithAccount {
  id: string
  external_campaign_id: string
  status: string | null
  platform: 'meta' | 'google'
  daily_budget: number | null
  ad_accounts: AdAccountRef | AdAccountRef[] | null
}

type ActionType = 'pause' | 'activate' | 'update_budget'

/** Normaliza o relacionamento ad_accounts (Supabase pode devolver array ou objeto). */
function accountOf(campaign: CampaignWithAccount): AdAccountRef | null {
  const ref = Array.isArray(campaign.ad_accounts)
    ? campaign.ad_accounts[0]
    : campaign.ad_accounts
  return ref ?? null
}

interface ActionContext {
  campaign: CampaignWithAccount
  account: AdAccountRef
  decryptedToken: string
  encryptionKey: string
}

/**
 * Núcleo compartilhado: auth + ownership + log pending + chamada de plataforma +
 * persistência condicional. `oldValue`/`newValue`/`localUpdate` são DERIVADOS da
 * campanha buscada (assim o action_log registra o estado real anterior, não um
 * placeholder). `runPlatform` recebe o token descriptografado e devolve o resultado
 * da API. `localUpdate` é o patch gravado em ad_campaigns SOMENTE em caso de sucesso
 * (CP1 4a).
 */
async function executeCampaignAction(params: {
  adCampaignId: string
  actionType: ActionType
  oldValue: (campaign: CampaignWithAccount) => Record<string, unknown>
  newValue: Record<string, unknown>
  runPlatform: (ctx: ActionContext) => Promise<PlatformActionResult>
  localUpdate: Record<string, unknown>
}): Promise<{ error?: string }> {
  const { supabase, user, workspaceId } = await getAuthenticatedWorkspace()

  // 1. Buscar campanha + conta com ownership check explícito (AC 2.7.6).
  //    RLS já filtra por workspace na leitura; o .eq('workspace_id') reforça na escrita.
  const { data: campaign, error: fetchErr } = await supabase
    .from('ad_campaigns')
    .select(
      'id, external_campaign_id, status, platform, daily_budget, ' +
        'ad_accounts!inner(id, encrypted_token, encrypted_refresh_token, external_account_id, workspace_id)'
    )
    .eq('id', params.adCampaignId)
    .eq('workspace_id', workspaceId)
    .single<CampaignWithAccount>()

  if (fetchErr || !campaign) {
    return { error: 'Campanha não encontrada' }
  }

  const account = accountOf(campaign)
  if (!account) {
    return { error: 'Conta de anúncio não encontrada' }
  }

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    return { error: 'Configuração de criptografia ausente' }
  }

  let decryptedToken: string
  try {
    decryptedToken = decryptToken(account.encrypted_token, encryptionKey)
  } catch {
    // Nunca expor detalhe da criptografia/token ao cliente.
    return { error: 'Falha ao preparar credenciais da conta' }
  }

  // 2. INSERT action_log pending — ANTES da chamada à API (CP1 2 / AC 2.7.2).
  const { data: logEntry, error: logErr } = await supabase
    .from('action_log')
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      ad_account_id: account.id,
      platform: campaign.platform,
      campaign_id: campaign.external_campaign_id,
      action_type: params.actionType,
      old_value: params.oldValue(campaign),
      new_value: params.newValue,
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>()

  if (logErr || !logEntry) {
    return { error: 'Falha ao registrar a ação' }
  }

  // 3. Chamada à API externa (Meta ou Google).
  const result = await params.runPlatform({
    campaign,
    account,
    decryptedToken,
    encryptionKey,
  })

  // 4a. Sucesso → action_log success + ad_campaigns atualizado (AC 2.7.4).
  if (result.success) {
    await supabase.from('action_log').update({ status: 'success' }).eq('id', logEntry.id)
    await supabase
      .from('ad_campaigns')
      .update(params.localUpdate)
      .eq('id', params.adCampaignId)
    revalidatePath('/campaigns')
    return {}
  }

  // 4b. Falha → action_log failed; ad_campaigns INALTERADO (AC 2.7.3 / 2.7.8).
  await supabase
    .from('action_log')
    .update({ status: 'failed', api_error: result.error ?? 'Erro desconhecido' })
    .eq('id', logEntry.id)
  return { error: result.error ?? 'Erro ao executar a ação' }
}

/**
 * Constrói o callback de refresh-on-401 para o Google: renova o access_token via
 * refreshGoogleToken (que re-persiste o token criptografado) e devolve o token
 * descriptografado em memória para o retry.
 */
function googleRefresher(
  account: AdAccountRef,
  encryptionKey: string
): (() => Promise<string>) | undefined {
  if (!account.encrypted_refresh_token) return undefined
  return async () => {
    const newEncrypted = await refreshGoogleToken(
      account.id,
      account.encrypted_refresh_token!,
      encryptionKey
    )
    return decryptToken(newEncrypted, encryptionKey)
  }
}

// ── pauseCampaign ────────────────────────────────────────────────────────────

export async function pauseCampaign(adCampaignId: string): Promise<{ error?: string }> {
  return executeCampaignAction({
    adCampaignId,
    actionType: 'pause',
    oldValue: (c) => ({ status: c.status }),
    newValue: { status: 'paused' },
    localUpdate: { status: 'paused' },
    runPlatform: async ({ campaign, account, decryptedToken, encryptionKey }) => {
      if (campaign.status === 'paused') return { success: true } // idempotente: já pausada
      if (campaign.platform === 'meta') {
        return metaPauseCampaign(campaign.external_campaign_id, decryptedToken)
      }
      return googlePauseCampaign(
        campaign.external_campaign_id,
        account.external_account_id,
        decryptedToken,
        googleRefresher(account, encryptionKey)
      )
    },
  })
}

// ── activateCampaign ─────────────────────────────────────────────────────────

export async function activateCampaign(
  adCampaignId: string
): Promise<{ error?: string }> {
  return executeCampaignAction({
    adCampaignId,
    actionType: 'activate',
    oldValue: (c) => ({ status: c.status }),
    newValue: { status: 'active' },
    localUpdate: { status: 'active' },
    runPlatform: async ({ campaign, account, decryptedToken, encryptionKey }) => {
      if (campaign.status === 'active') return { success: true } // idempotente: já ativa
      if (campaign.platform === 'meta') {
        return metaActivateCampaign(campaign.external_campaign_id, decryptedToken)
      }
      return googleActivateCampaign(
        campaign.external_campaign_id,
        account.external_account_id,
        decryptedToken,
        googleRefresher(account, encryptionKey)
      )
    },
  })
}

// ── updateCampaignBudget ─────────────────────────────────────────────────────

export async function updateCampaignBudget(
  adCampaignId: string,
  newBudget: number
): Promise<{ error?: string }> {
  if (!Number.isFinite(newBudget) || newBudget <= 0) {
    return { error: 'Valor de orçamento inválido' }
  }

  return executeCampaignAction({
    adCampaignId,
    actionType: 'update_budget',
    oldValue: (c) => ({ daily_budget: c.daily_budget }),
    newValue: { daily_budget: newBudget },
    localUpdate: { daily_budget: newBudget },
    runPlatform: async ({ campaign, account, decryptedToken, encryptionKey }) => {
      if (campaign.platform === 'meta') {
        return metaUpdateBudget(campaign.external_campaign_id, decryptedToken, newBudget)
      }
      return googleUpdateBudget(
        campaign.external_campaign_id,
        account.external_account_id,
        decryptedToken,
        newBudget,
        googleRefresher(account, encryptionKey)
      )
    },
  })
}
