import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'

/**
 * GET /api/oauth/google/start  (Story 2.2 — AC 2.2.2)
 *
 * Inicia o fluxo OAuth do Google Ads:
 *  1. Gera um `state` aleatório (CSRF guard).
 *  2. Armazena o state em cookie httpOnly `oauth_state_google` (SameSite=Lax,
 *     maxAge 600s). Usamos um nome distinto do `oauth_state` da Meta para evitar
 *     conflito quando ambos os fluxos estiverem em andamento.
 *  3. Redireciona para o consent screen do Google com `access_type=offline` e
 *     `prompt=consent` — isso garante que o Google sempre retorne um refresh_token
 *     (sem `prompt=consent`, o refresh_token só vem na primeira autorização).
 *
 * O callback (/api/oauth/google/callback) valida o cookie contra o `state` retornado.
 */
export async function GET(): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID not configured' },
      { status: 500 }
    )
  }
  if (!redirectUri) {
    return NextResponse.json(
      { error: 'GOOGLE_REDIRECT_URI not configured' },
      { status: 500 }
    )
  }

  const state = randomUUID()

  const cookieStore = await cookies()
  cookieStore.set('oauth_state_google', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'https://www.googleapis.com/auth/adwords',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return NextResponse.redirect(oauthUrl)
}
