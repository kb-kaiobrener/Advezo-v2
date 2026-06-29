/**
 * Mutações de campanha na Google Ads API v17 (Story 2.7).
 *
 * Mesmo padrão de fetch/headers de `lib/sync/google.ts` (GOOGLE_ADS_API_BASE v17,
 * Authorization Bearer + developer-token). Pause/activate usam campaigns:mutate; o
 * ajuste de orçamento usa campaignBudgets:mutate (recurso separado — ver
 * googleUpdateBudget).
 *
 * Diferença em relação ao Meta: o Google distingue access_token (curta duração) de
 * refresh_token. Em 401 UNAUTHENTICATED a Server Action renova o access_token via
 * `refreshGoogleToken` e re-tenta. Para manter estas funções desacopladas do banco,
 * elas recebem um callback opcional `refreshAccessToken` que devolve um novo token
 * descriptografado; quando o callback não é fornecido, o 401 vira falha direta.
 *
 * O customerId vem de ad_accounts.external_account_id (sem hífens na API). O
 * resourceName da campanha é customers/{customerId}/campaigns/{externalCampaignId}.
 */

import type { PlatformActionResult } from './meta-campaigns'

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v17'

type CampaignOperation = {
  update: Record<string, unknown>
  updateMask: string
}

interface GoogleMutateResponse {
  error?: { message?: string }
}

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, '') // a API usa o ID sem hífens
}

function buildMutateRequest(
  customerId: string,
  accessToken: string,
  operation: CampaignOperation
): { url: string; init: RequestInit } | { error: string } {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    return { error: 'GOOGLE_ADS_DEVELOPER_TOKEN não configurada' }
  }

  return {
    url: `${GOOGLE_ADS_API_BASE}/customers/${normalizeCustomerId(customerId)}/campaigns:mutate`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations: [operation] }),
    },
  }
}

/**
 * Executa um campaigns:mutate. Em 401, se `refreshAccessToken` for fornecido, renova
 * o token e re-tenta uma vez (AC 2.4.2 / 2.7 — paridade com o sync). Erros de rede e
 * timeout são convertidos em falha (AC 2.7.8), nunca propagam exceção.
 */
async function googleMutate(
  customerId: string,
  accessToken: string,
  operation: CampaignOperation,
  refreshAccessToken?: () => Promise<string>
): Promise<PlatformActionResult> {
  const built = buildMutateRequest(customerId, accessToken, operation)
  if ('error' in built) return { success: false, error: built.error }

  try {
    let res = await fetch(built.url, built.init)

    if (res.status === 401 && refreshAccessToken) {
      let freshToken: string
      try {
        freshToken = await refreshAccessToken()
      } catch (refreshErr) {
        return {
          success: false,
          error:
            refreshErr instanceof Error
              ? refreshErr.message
              : 'Falha ao renovar token do Google',
        }
      }
      const retry = buildMutateRequest(customerId, freshToken, operation)
      if ('error' in retry) return { success: false, error: retry.error }
      res = await fetch(retry.url, retry.init)
    }

    if (res.ok) return { success: true }

    const body = (await res.json().catch(() => ({}))) as GoogleMutateResponse
    return {
      success: false,
      error: body.error?.message ?? `Google Ads API error ${res.status}`,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro de rede ao contatar o Google',
    }
  }
}

function campaignResourceName(customerId: string, externalCampaignId: string): string {
  return `customers/${normalizeCustomerId(customerId)}/campaigns/${externalCampaignId}`
}

export function googlePauseCampaign(
  externalCampaignId: string,
  customerId: string,
  accessToken: string,
  refreshAccessToken?: () => Promise<string>
): Promise<PlatformActionResult> {
  return googleMutate(
    customerId,
    accessToken,
    {
      update: {
        resourceName: campaignResourceName(customerId, externalCampaignId),
        status: 'PAUSED',
      },
      updateMask: 'status',
    },
    refreshAccessToken
  )
}

export function googleActivateCampaign(
  externalCampaignId: string,
  customerId: string,
  accessToken: string,
  refreshAccessToken?: () => Promise<string>
): Promise<PlatformActionResult> {
  return googleMutate(
    customerId,
    accessToken,
    {
      update: {
        resourceName: campaignResourceName(customerId, externalCampaignId),
        status: 'ENABLED',
      },
      updateMask: 'status',
    },
    refreshAccessToken
  )
}

/**
 * Busca o resourceName do CampaignBudget via GAQL.
 *
 * Necessário porque o orçamento do Google Ads NÃO vive no recurso Campaign: ele vive
 * em um recurso separado (CampaignBudget), e o endpoint de mutação exige o
 * resourceName próprio do budget (customers/{cid}/campaignBudgets/{bid}). Aqui
 * consultamos campaign.campaign_budget filtrando pela campanha para descobrir esse
 * resourceName antes da mutação.
 *
 * Erros de API/rede são convertidos em `{ error }` (nunca propaga exceção).
 */
async function fetchCampaignBudgetResourceName(
  customerId: string,
  externalCampaignId: string,
  accessToken: string
): Promise<{ resourceName: string } | { error: string }> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) return { error: 'GOOGLE_ADS_DEVELOPER_TOKEN não configurada' }

  const query = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.resource_name = 'customers/${normalizeCustomerId(customerId)}/campaigns/${externalCampaignId}'`

  try {
    const res = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${normalizeCustomerId(customerId)}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    )

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      return { error: body.error?.message ?? `Google Ads search error ${res.status}` }
    }

    const body = (await res.json()) as {
      results?: Array<{ campaign?: { campaignBudget?: string } }>
    }
    const budgetResourceName = body.results?.[0]?.campaign?.campaignBudget
    if (!budgetResourceName) {
      return { error: 'CampaignBudget não encontrado para esta campanha' }
    }

    return { resourceName: budgetResourceName }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro de rede ao buscar budget' }
  }
}

/**
 * Ajusta o orçamento diário da campanha (Story 2.7 — AC 2.7.5).
 *
 * Fluxo correto em duas etapas:
 *   1. fetchCampaignBudgetResourceName → descobre o resourceName do CampaignBudget
 *      associado à campanha (recurso separado de Campaign). Se não encontrar (ou erro
 *      de API/rede), retorna falha SEM tentar mutar — estado local preservado.
 *   2. campaignBudgets:mutate (endpoint próprio, distinto de campaigns:mutate) ajusta
 *      amount_micros. newBudget chega em BRL → micros (1 unidade = 1_000_000 micros).
 *
 * 401 UNAUTHENTICATED na mutação dispara refresh-on-401 (paridade com o sync). Erros
 * de rede/timeout viram falha (AC 2.7.8), nunca propagam exceção.
 */
export async function googleUpdateBudget(
  externalCampaignId: string,
  customerId: string,
  accessToken: string,
  newBudget: number,
  refreshAccessToken?: () => Promise<string>
): Promise<PlatformActionResult> {
  // 1. Descobrir o resourceName do CampaignBudget — pré-requisito da mutação.
  const budgetRef = await fetchCampaignBudgetResourceName(
    customerId,
    externalCampaignId,
    accessToken
  )
  if ('error' in budgetRef) return { success: false, error: budgetRef.error }

  const micros = Math.round(newBudget * 1_000_000)
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    return { success: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN não configurada' }
  }

  const mutateUrl = `${GOOGLE_ADS_API_BASE}/customers/${normalizeCustomerId(customerId)}/campaignBudgets:mutate`
  const buildInit = (token: string): RequestInit => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: budgetRef.resourceName,
            amountMicros: String(micros),
          },
          updateMask: 'amount_micros',
        },
      ],
    }),
  })

  try {
    // 2. Mutar o CampaignBudget (endpoint separado: campaignBudgets:mutate).
    let res = await fetch(mutateUrl, buildInit(accessToken))

    if (res.status === 401 && refreshAccessToken) {
      let freshToken: string
      try {
        freshToken = await refreshAccessToken()
      } catch (refreshErr) {
        return {
          success: false,
          error:
            refreshErr instanceof Error
              ? refreshErr.message
              : 'Falha ao renovar token do Google',
        }
      }
      res = await fetch(mutateUrl, buildInit(freshToken))
    }

    if (res.ok) return { success: true }

    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    return {
      success: false,
      error: body.error?.message ?? `Google Ads API error ${res.status}`,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro de rede ao contatar o Google',
    }
  }
}
