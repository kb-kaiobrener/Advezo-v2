'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

export interface ClientUser {
  id: string
  workspace_id: string
  client_id: string
  user_id: string
  email: string
  invited_at: string
  accepted_at: string | null
}

async function getWorkspaceMembership() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const, membership: null }

  const serviceClient = createSupabaseServiceClient()
  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return { error: 'Workspace não encontrado' as const, membership: null }
  return { error: null, membership }
}

/**
 * Convida o cliente final por email (Story 3.8, AC 3.8.1).
 * Somente gestor autenticado do workspace; o cliente define senha em
 * /cliente/definir-senha e acessa /cliente.
 */
export async function inviteClientUser(clientId: string, email: string) {
  // Validação de formato pré-auth (padrão das stories 3.3/3.6)
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: 'Email inválido' }
  }

  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()

  // Cliente precisa pertencer ao workspace do gestor (IDOR)
  const { data: client } = await serviceClient
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('workspace_id', membership!.workspace_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!client) return { error: 'Cliente não encontrado' }

  // Convite via Supabase Auth — email com link para definir senha
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    normalized,
    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/cliente/definir-senha` }
  )

  if (inviteError || !invited?.user) {
    // email já registrado no auth é o caso mais comum
    return { error: `Não foi possível enviar o convite: ${inviteError?.message ?? 'erro desconhecido'}` }
  }

  const { error: dbError } = await serviceClient.from('client_users').insert({
    workspace_id: membership!.workspace_id,
    client_id: clientId,
    user_id: invited.user.id,
    email: normalized,
  })

  if (dbError) {
    return { error: 'Convite enviado, mas houve erro ao registrar o acesso — contate o suporte' }
  }

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}
