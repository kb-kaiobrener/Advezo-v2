import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Gate de senha para dashboards públicos (/dashboard/:token) — Story 3.7 (T5.5).
 *
 * Roda no Edge runtime: sem node:crypto. Usa WebCrypto (globalThis.crypto) para
 * verificar o cookie HMAC de forma timing-safe.
 *
 * Fluxo:
 *   - fetch leve (Supabase REST) para ler password_hash/password_salt do token;
 *   - token inexistente/inativo → next() (page.tsx chama notFound());
 *   - sem senha → next() (ISR direto);
 *   - com senha + cookie válido → next();
 *   - com senha sem cookie válido → redirect /dashboard/:token/senha.
 */
async function handleDashboardPasswordGate(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const token = pathname.split('/')[2] // /dashboard/[token]

  // Não interceptar a própria tela de senha nem os endpoints de API (evita loop).
  if (!token || pathname.includes('/senha') || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    // Sem credenciais não há como validar — tratar como não autenticado (fail-closed).
    return NextResponse.redirect(new URL(`/dashboard/${token}/senha`, request.url))
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/dashboard_configs?select=password_hash,password_salt&token=eq.${encodeURIComponent(
      token
    )}&is_active=eq.true&limit=1`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: 'no-store',
    }
  )

  const rows = (await res.json().catch(() => [])) as Array<{
    password_hash: string | null
    password_salt: string | null
  }>
  const config = rows[0]

  // Token não encontrado ou inativo — deixa page.tsx chamar notFound().
  if (!config) return NextResponse.next()

  // Dashboard público — ISR direto.
  if (!config.password_hash) return NextResponse.next()

  // Dashboard com senha — verificar cookie (WebCrypto, sem node:crypto no Edge).
  const secret = process.env.DASHBOARD_AUTH_SECRET
  const cookieName = `dash_auth_${token}`
  const cookieVal = request.cookies.get(cookieName)?.value

  if (secret && cookieVal && /^[0-9a-f]+$/i.test(cookieVal) && cookieVal.length % 2 === 0) {
    try {
      const enc = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      const cookieBytes = Uint8Array.from(cookieVal.match(/../g)!.map((h) => parseInt(h, 16)))
      const message = enc.encode(token + config.password_hash)
      const valid = await crypto.subtle.verify('HMAC', key, cookieBytes, message)
      if (valid) return NextResponse.next()
    } catch {
      // qualquer falha de verificação → tratar como não autenticado
    }
  }

  // Sem cookie válido → redirect para /senha.
  return NextResponse.redirect(new URL(`/dashboard/${token}/senha`, request.url))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Dashboards públicos (/dashboard/:token) são links de cliente sem login — nunca
  // devem passar pelo guard de auth abaixo. O gate deles é apenas a senha (se houver).
  const isPublicDashboard = pathname.startsWith('/dashboard/')
  if (isPublicDashboard) {
    return handleDashboardPasswordGate(request)
  }

  // O endpoint público de auth do dashboard (/api/dashboard/:token/auth) não passa
  // pelo guard de login — é autenticado pela própria senha do dashboard (AC 3.7.5).
  const isDashboardAuthApi = pathname.startsWith('/api/dashboard/')
  if (isDashboardAuthApi) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — required by @supabase/ssr on every request
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/auth/')
  const isOnboarding = pathname === '/onboarding'
  const isDashboard = !isAuthRoute && !isOnboarding && !isPublicDashboard && pathname !== '/'

  const hasWorkspace = !!user?.user_metadata?.workspace_id

  // Unauthenticated access to protected routes → /login
  if (isDashboard && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated access to auth pages → /dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Authenticated with workspace on /onboarding → /dashboard
  if (user && hasWorkspace && isOnboarding) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
