import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { encryptToken } from '@advezo/utils'
import { createSupabaseServerClient } from '@advezo/database'

/**
 * GET /api/oauth/meta/callback  (Story 2.1 — AC 2.1.4 / 2.1.5 / 2.1.6 / 2.1.9)
 *
 * Fluxo:
 *  1. Valida o cookie `oauth_state` contra o `state` recebido (CSRF guard → 400).
 *  2. Deleta o cookie imediatamente (evita reuso).
 *  3. Valida TOKEN_ENCRYPTION_KEY (64 hex chars → 500 se ausente/inválido).
 *  4. Troca `code` → short-lived token → long-lived token (fb_exchange_token).
 *  5. Lista contas de anúncio via /me/adaccounts.
 *  6. Criptografa o long-lived token e faz upsert de cada conta em ad_accounts.
 *  7. Redireciona para /settings/integrations?status=success (ou ?error=oauth_failed).
 *
 * NOTA sobre external_account_id: a Meta retorna IDs no formato `act_123456`.
 * Armazenamos o ID COMPLETO com o prefixo `act_`, pois os endpoints da Graph API
 * para contas de anúncio (usados na sync da Story 2.3) esperam esse prefixo.
 */

const GRAPH_BASE = 'https://graph.facebook.com'

const ENCRYPTION_KEY_HEX_LENGTH = 64

interface MetaAdAccount {
  id: string
  name?: string
  account_status?: number
}

function integrationsRedirect(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings/integrations${query}`, request.url))
}

/** Troca o authorization code por um short-lived access token. */
export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Code exchange failed: ${res.status}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Code exchange returned no access_token')
  return json.access_token
}

/** Troca um short-lived token por um long-lived token (60 dias). */
export async function exchangeForLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Long-lived exchange failed: ${res.status}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Long-lived exchange returned no access_token')
  return json.access_token
}

/** Lista todas as contas de anúncio acessíveis pelo token. */
export async function fetchAdAccounts(longToken: string): Promise<MetaAdAccount[]> {
  const params = new URLSearchParams({
    fields: 'id,name,account_status',
    access_token: longToken,
  })
  const res = await fetch(`${GRAPH_BASE}/me/adaccounts?${params.toString()}`)
  if (!res.ok) throw new Error(`adaccounts fetch failed: ${res.status}`)
  const json = (await res.json()) as { data?: MetaAdAccount[] }
  return json.data ?? []
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('oauth_state')?.value

  // CSRF guard — sempre deleta o cookie para evitar reuso.
  cookieStore.delete('oauth_state')

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

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_REDIRECT_URI
  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Meta OAuth env not configured' },
      { status: 500 }
    )
  }

  if (!code) {
    return integrationsRedirect(request, '?error=oauth_failed')
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const workspaceId = user?.user_metadata?.workspace_id as string | undefined
    if (!workspaceId) {
      return integrationsRedirect(request, '?error=oauth_failed')
    }

    const shortToken = await exchangeCodeForToken(code, appId, appSecret, redirectUri)
    const longToken = await exchangeForLongLivedToken(shortToken, appId, appSecret)
    const accounts = await fetchAdAccounts(longToken)

    const encryptedToken = encryptToken(longToken, encryptionKey)

    const rows = accounts.map((account) => ({
      workspace_id: workspaceId,
      platform: 'meta' as const,
      external_account_id: account.id, // mantém prefixo act_
      account_name: account.name ?? null,
      encrypted_token: encryptedToken,
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

    return integrationsRedirect(request, '?status=success')
  } catch {
    return integrationsRedirect(request, '?error=oauth_failed')
  }
}
