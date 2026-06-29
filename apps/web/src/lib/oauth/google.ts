import { encryptToken, decryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'

/**
 * Helpers de OAuth / Google Ads API (Story 2.2 — AC 2.2.5 / AC 2.2.6)
 *
 * - `listGoogleAdsCustomers`: lista os customer_ids acessíveis pelo access_token via
 *   Google Ads REST API (`customers:listAccessibleCustomers`). Suporta modo sandbox:
 *   quando `GOOGLE_ADS_TEST_CUSTOMER_ID` está definido, retorna apenas esse ID sem
 *   chamar a API (contas de teste / PC-03).
 * - `refreshGoogleToken`: descriptografa o refresh_token, obtém um novo access_token
 *   via `grant_type=refresh_token`, re-criptografa e persiste em ad_accounts. Usado
 *   pela tarefa de sync (Story 2.4); aqui apenas criado e testado unitariamente.
 *
 * Usamos a REST API diretamente (fetch) em vez do SDK `googleapis` para manter zero
 * dependências novas e espelhar o padrão do callback Meta da Story 2.1.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v17'

/**
 * Lista os customer_ids do Google Ads acessíveis por um access_token.
 *
 * Em modo sandbox (GOOGLE_ADS_TEST_CUSTOMER_ID definido), retorna apenas esse ID
 * sem chamar a API — permite desenvolvimento sem Developer Token de produção (PC-03).
 *
 * Em produção, chama `customers:listAccessibleCustomers`, que retorna resourceNames
 * no formato `customers/1234567890`; extraímos apenas o ID numérico.
 */
export async function listGoogleAdsCustomers(accessToken: string): Promise<string[]> {
  const testCustomerId = process.env.GOOGLE_ADS_TEST_CUSTOMER_ID
  if (testCustomerId) {
    return [testCustomerId]
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not configured')
  }

  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  })
  if (!res.ok) throw new Error(`listAccessibleCustomers failed: ${res.status}`)

  const json = (await res.json()) as { resourceNames?: string[] }
  // resourceNames vêm como "customers/1234567890" — extrai só o ID.
  return (json.resourceNames ?? []).map((name) => name.split('/').pop() ?? name)
}

/**
 * Renova o access_token de uma conta Google a partir do refresh_token criptografado.
 *
 * @param adAccountId           id da linha em ad_accounts a atualizar
 * @param encryptedRefreshToken refresh_token criptografado (coluna encrypted_refresh_token)
 * @param keyHex                TOKEN_ENCRYPTION_KEY (hex, 64 chars)
 * @returns                     o novo access_token JÁ criptografado (encrypted_token)
 *
 * Em caso de falha do refresh, marca a conta como `status='error'` com a mensagem,
 * e relança o erro para o chamador (sync da Story 2.4) tratar.
 */
export async function refreshGoogleToken(
  adAccountId: string,
  encryptedRefreshToken: string,
  keyHex: string
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth env not configured')
  }

  const refreshToken = decryptToken(encryptedRefreshToken, keyHex)

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)

    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('Google token refresh returned no access_token')

    const newEncryptedToken = encryptToken(json.access_token, keyHex)

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('ad_accounts')
      .update({ encrypted_token: newEncryptedToken, status: 'active', error_message: null })
      .eq('id', adAccountId)
    if (error) throw new Error(`Update failed: ${error.message}`)

    return newEncryptedToken
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown refresh error'
    const supabase = await createSupabaseServerClient()
    await supabase
      .from('ad_accounts')
      .update({ status: 'error', error_message: message })
      .eq('id', adAccountId)
    throw err
  }
}
