import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'

/**
 * GET /api/oauth/meta/start  (Story 2.1 — AC 2.1.3)
 *
 * Inicia o fluxo OAuth da Meta:
 *  1. Gera um `state` aleatório (CSRF guard).
 *  2. Armazena o state em cookie httpOnly `oauth_state` (SameSite=Lax, maxAge 600s).
 *  3. Redireciona para o diálogo OAuth da Meta com os escopos de Ads.
 *
 * O callback (/api/oauth/meta/callback) valida o cookie contra o `state` retornado.
 */
export async function GET() {
  const appId = process.env.META_APP_ID
  const redirectUri = process.env.META_REDIRECT_URI

  if (!appId) {
    return NextResponse.json(
      { error: 'META_APP_ID not configured' },
      { status: 500 }
    )
  }
  if (!redirectUri) {
    return NextResponse.json(
      { error: 'META_REDIRECT_URI not configured' },
      { status: 500 }
    )
  }

  const state = randomUUID()

  const cookieStore = await cookies()
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'ads_management,ads_read',
    response_type: 'code',
    state,
  })

  const oauthUrl = `https://www.facebook.com/dialog/oauth?${params.toString()}`

  return NextResponse.redirect(oauthUrl)
}
