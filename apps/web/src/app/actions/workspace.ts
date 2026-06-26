'use server'

import { createSupabaseServerClient } from '@advezo/database'
import { redirect } from 'next/navigation'

export async function createWorkspace(formData: FormData) {
  const name = (formData.get('name') as string)?.trim() || 'Meu Workspace'
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if user already has a workspace
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (existing) redirect('/dashboard')

  // Create workspace + add owner (trigger auto-creates workspace_settings)
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .insert({ name, created_by: user.id })
    .select('id')
    .single()

  if (error || !workspace) {
    return { error: 'Erro ao criar workspace. Tente novamente.' }
  }

  const { error: memberError } = await supabase
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
