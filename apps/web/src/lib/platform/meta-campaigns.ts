/**
 * Mutações de campanha na Meta Marketing API (Story 2.7).
 *
 * Funções puras: recebem o external_campaign_id e o access_token JÁ descriptografado,
 * chamam a Graph API e retornam `{ success: true }` ou `{ success: false, error }`.
 * NÃO acessam o banco e NÃO descriptografam tokens — isso é responsabilidade da
 * Server Action (campaigns.ts). Mantém o mesmo GRAPH_VERSION v19.0 do sync (meta.ts).
 *
 * Atualizações de campanha na Meta são POST para /{campaign_id} com o campo a alterar
 * na query string. Resposta de sucesso: `{ success: true }`. Erro: HTTP ≠ 2xx com
 * `{ error: { message } }`. Erros de rede/timeout são capturados e convertidos em
 * `{ success: false, error }` (AC 2.7.8 — nunca propaga exceção ao caller).
 */

const GRAPH_BASE = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v19.0'

export interface PlatformActionResult {
  success: boolean
  error?: string
}

interface MetaUpdateResponse {
  success?: boolean
  error?: { message?: string }
}

/** Executa um POST de update na Graph API e normaliza o resultado. */
async function metaUpdate(
  externalCampaignId: string,
  accessToken: string,
  field: string,
  value: string
): Promise<PlatformActionResult> {
  const params = new URLSearchParams({
    [field]: value,
    access_token: accessToken,
  })
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${externalCampaignId}?${params.toString()}`

  try {
    const res = await fetch(url, { method: 'POST' })
    const body = (await res.json().catch(() => ({}))) as MetaUpdateResponse

    if (res.ok && body.success) return { success: true }

    return {
      success: false,
      error: body.error?.message ?? `Meta API error ${res.status}`,
    }
  } catch (err) {
    // Rede/timeout (AC 2.7.8): trata como falha, não propaga.
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro de rede ao contatar a Meta',
    }
  }
}

export function metaPauseCampaign(
  externalCampaignId: string,
  accessToken: string
): Promise<PlatformActionResult> {
  return metaUpdate(externalCampaignId, accessToken, 'status', 'PAUSED')
}

export function metaActivateCampaign(
  externalCampaignId: string,
  accessToken: string
): Promise<PlatformActionResult> {
  return metaUpdate(externalCampaignId, accessToken, 'status', 'ACTIVE')
}

/**
 * Ajusta o orçamento diário. A Meta espera daily_budget em centavos (menor unidade
 * da moeda da conta). newBudget chega em BRL → converte para centavos.
 */
export function metaUpdateBudget(
  externalCampaignId: string,
  accessToken: string,
  newBudget: number
): Promise<PlatformActionResult> {
  const cents = Math.round(newBudget * 100)
  return metaUpdate(externalCampaignId, accessToken, 'daily_budget', String(cents))
}
