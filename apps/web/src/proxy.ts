import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/auth/')
  const isOnboarding = pathname === '/onboarding'
  const isDashboard = !isAuthRoute && !isOnboarding && pathname !== '/'

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

  // Authenticated but no workspace → /onboarding (com ?refresh=1 se vindo do /dashboard)
  if (user && !hasWorkspace && !isOnboarding && !isAuthRoute) {
    const destination = pathname === '/dashboard' ? '/onboarding?refresh=1' : '/onboarding'
    return NextResponse.redirect(new URL(destination, request.url))
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
