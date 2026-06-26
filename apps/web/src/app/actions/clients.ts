'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { ClientSchema, type ClientFormData } from '@/lib/schemas/clients'

async function getAuthenticatedWorkspace() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  return { supabase, user, workspaceId: membership.workspace_id }
}

export async function createClient(data: ClientFormData) {
  const validated = ClientSchema.parse(data)
  const { supabase, workspaceId } = await getAuthenticatedWorkspace()

  const { error } = await supabase.from('clients').insert({
    workspace_id: workspaceId,
    name: validated.name,
    document: validated.document || null,
    contact_email: validated.contact_email || null,
    contact_phone: validated.contact_phone || null,
  })

  if (error) return { error: 'Erro ao criar cliente. Tente novamente.' }

  revalidatePath('/clients')
  redirect('/clients')
}

export async function updateClient(id: string, data: ClientFormData) {
  const validated = ClientSchema.parse(data)
  const { supabase } = await getAuthenticatedWorkspace()

  const { error } = await supabase
    .from('clients')
    .update({
      name: validated.name,
      document: validated.document || null,
      contact_email: validated.contact_email || null,
      contact_phone: validated.contact_phone || null,
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { error: 'Erro ao atualizar cliente. Tente novamente.' }

  revalidatePath('/clients')
  redirect('/clients')
}

export async function archiveClient(id: string) {
  const { supabase } = await getAuthenticatedWorkspace()

  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { error: 'Erro ao arquivar cliente.' }

  revalidatePath('/clients')
}
