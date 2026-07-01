'use server'

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { redirect } from 'next/navigation'

export async function createWorkspace(formData: FormData) {
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

  const { data: workspace, error } = await serviceClient
    .from('workspaces')
    .insert({ name, created_by: user.id })
    .select('id')
    .single()

  if (error || !workspace) {
    return { error: 'Erro ao criar workspace. Tente novamente.' }
  }

  const { error: memberError } = await serviceClient
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    return { error: 'Erro ao configurar workspace. Tente novamente.' }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
