import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { encryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'
import { listGoogleAdsCustomers } from '@/lib/oauth/google'

/**
 * GET /api/oauth/google/callback  (Story 2.2 — AC 2.2.3 / 2.2.4 / 2.2.5 / 2.2.8)
 *
 * Fluxo:
 *  1. Valida o cookie `oauth_state_google` contra o `state` recebido (CSRF → 400).
 *  2. Deleta o cookie imediatamente (evita reuso).
 *  3. Valida TOKEN_ENCRYPTION_KEY (64 hex chars → 500 se ausente/inválido) e o env
 *     do Google (→ 500 se ausente).
 *  4. Troca `code` → { access_token, refresh_token } via oauth2.googleapis.com/token.
 *  5. Criptografa AMBOS os tokens com encryptToken (AC 2.2.4 — nenhum texto puro).
 *  6. Lista os customer_ids acessíveis (sandbox: GOOGLE_ADS_TEST_CUSTOMER_ID).
 *  7. Faz upsert de cada conta em ad_accounts (platform='google').
 *  8. Redireciona para /settings/integrations?status=success&platform=google
 *     (ou ?error=google_oauth_failed).
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const ENCRYPTION_KEY_HEX_LENGTH = 64

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

function integrationsRedirect(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings/integrations${query}`, request.url))
}

/** Troca o authorization code por { access_token, refresh_token } no Google. */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Google code exchange failed: ${res.status}`)

  const json = (await res.json()) as GoogleTokenResponse
  if (!json.access_token) throw new Error('Google code exchange returned no access_token')
  if (!json.refresh_token) {
    // Sem refresh_token não há como renovar (Story 2.4). access_type=offline +
    // prompt=consent no /start garantem que ele venha; ausência é erro de config.
    throw new Error('Google code exchange returned no refresh_token')
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('oauth_state_google')?.value

  // CSRF guard — sempre deleta o cookie para evitar reuso.
  cookieStore.delete('oauth_state_google')

  if (!state || !storedState || state !== storedState) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 400 })
  }

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey || encryptionKey.length !== ENCRYPTION_KEY_HEX_LENGTH) {
    return NextResponse.json(
      { error: 'Encryption key not configured' },
      { status: 500 }
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth env not configured' },
      { status: 500 }
    )
  }

  if (!code) {
    return integrationsRedirect(request, '?error=google_oauth_failed')
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const workspaceId = user?.user_metadata?.workspace_id as string | undefined
    if (!workspaceId) {
      return integrationsRedirect(request, '?error=google_oauth_failed')
    }

    const { accessToken, refreshToken } = await exchangeGoogleCode(
      code,
      clientId,
      clientSecret,
      redirectUri
    )

    // AC 2.2.4 — AMBOS os tokens criptografados, nunca em texto puro.
    const encryptedToken = encryptToken(accessToken, encryptionKey)
    const encryptedRefreshToken = encryptToken(refreshToken, encryptionKey)

    const customerIds = await listGoogleAdsCustomers(accessToken)

    const rows = customerIds.map((customerId) => ({
      workspace_id: workspaceId,
      platform: 'google' as const,
      external_account_id: customerId,
      account_name: null,
      encrypted_token: encryptedToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_type: 'access_token',
      status: 'active' as const,
      error_message: null,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('ad_accounts')
        .upsert(rows, { onConflict: 'workspace_id,platform,external_account_id' })
      if (error) throw new Error(`Upsert failed: ${error.message}`)
    }

    return integrationsRedirect(request, '?status=success&platform=google')
  } catch {
    return integrationsRedirect(request, '?error=google_oauth_failed')
  }
}
