import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json([])
  }

  const { data } = await supabase
    .from('ad_accounts')
    .select('id, account_name, platform, status')
    .eq('client_id', clientId)
    .order('account_name')

  return NextResponse.json(data ?? [])
}
