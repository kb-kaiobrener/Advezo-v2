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

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .is('deleted_at', null)
    .order('name')

  // Fix TD-006: nunca mascarar erro como lista vazia — um 403 de grant/RLS
  // ficava invisível (`data ?? []`), escondendo os clientes do gestor.
  if (error) {
    console.error('[api/clients] erro ao listar clientes:', error.message)
    return NextResponse.json({ error: 'Erro ao carregar clientes' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
