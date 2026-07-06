import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@advezo/database'

/**
 * POST /api/dashboard/[token]/auth — valida a senha de um dashboard protegido (Story 3.7, AC 3.7.5).
 *
 * Endpoint público sem JWT: autenticado pela senha do dashboard. Em sucesso, seta
 * cookie httpOnly `dash_auth_[token]` = HMAC-SHA256(token + password_hash, secret),
 * expira em 24h. O middleware (proxy.ts) valida esse cookie via WebCrypto nas
 * próximas visitas, sem novo hit ao DB.
 *
 * Segurança:
 *  - createSupabaseServiceClient() (service-role, ignora RLS) escopado por token;
 *  - crypto.timingSafeEqual previne timing attacks — nunca comparar hashes com !==;
 *  - senha nunca logada nem retornada em erros.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = (await req.json().catch(() => ({}))) as { password?: string }
  const password = body.password
  if (!password) {
    return NextResponse.json({ error: 'senha obrigatória' }, { status: 400 })
  }

  const secret = process.env.DASHBOARD_AUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'configuração ausente' }, { status: 500 })
  }

  const db = createSupabaseServiceClient()
  const { data: config } = await db
    .from('dashboard_configs')
    .select('password_hash, password_salt')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!config?.password_hash || !config.password_salt) {
    return NextResponse.json({ error: 'token inválido' }, { status: 404 })
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(password + config.password_salt)
    .digest('hex')

  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(config.password_hash)
  const hashesMatch =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf)

  if (!hashesMatch) {
    return NextResponse.json({ error: 'senha incorreta' }, { status: 401 })
  }

  const cookieVal = crypto
    .createHmac('sha256', secret)
    .update(token + config.password_hash)
    .digest('hex')

  const res = NextResponse.json({ ok: true })
  res.cookies.set(`dash_auth_${token}`, cookieVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: `/dashboard/${token}`,
  })
  return res
}
