'use server'

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { redirect } from 'next/navigation'

export async function createWorkspace(formData: FormData) {
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL)
  console.log('SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  const name = (formData.get('name') as string)?.trim() || 'Meu Workspace'
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if user already has a workspace (RLS ok here — user is authenticated)
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (existing) redirect('/dashboard')

  // Service client bypasses RLS for INSERT — user has no workspace_id in JWT yet
  const serviceClient = createSupabaseServiceClient()

  console.log('Tentando INSERT em workspaces...')
  const { data: workspace, error } = await serviceClient
    .from('workspaces')
    .insert({ name, created_by: user.id })
    .select('id')
    .single()

  if (error || !workspace) {
    console.error('Erro completo:', JSON.stringify(error))
    return { error: 'Erro ao criar workspace. Tente novamente.' }
  }

  console.log('Tentando INSERT em workspace_members...')
  const { error: memberError } = await serviceClient
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    console.error('Erro completo:', JSON.stringify(memberError))
    return { error: 'Erro ao configurar workspace. Tente novamente.' }
  }

  // Force JWT refresh so custom_access_token_hook injects the new workspace_id
  const supabaseRefresh = await createSupabaseServerClient()
  await supabaseRefresh.auth.refreshSession()

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
