import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'

/** Logout do cliente final — POST /cliente/sair (Story 3.8). */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/cliente/login', request.url), { status: 303 })
}
