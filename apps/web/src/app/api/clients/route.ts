import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'

export async function GET() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .is('deleted_at', null)
    .order('name')

  return NextResponse.json(data ?? [])
}
