import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspace_id') ?? ''
  const accountId   = req.nextUrl.searchParams.get('account_id') ?? ''
  if (!workspaceId || !accountId)
    return NextResponse.json({ error: 'workspace_id e account_id são obrigatórios' }, { status: 400 })

  const serviceClient = createSupabaseServiceClient()
  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .limit(1)
    .single()

  if (!membership) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const url = `${process.env.WHATSAPP_WORKER_URL}/qr?workspace_id=${workspaceId}&account_id=${accountId}`
  const workerRes = await fetch(url)
  const data = await workerRes.json()
  return NextResponse.json(data, { status: workerRes.status })
}
