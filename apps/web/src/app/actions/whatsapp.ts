'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

const WORKER_URL = process.env.WHATSAPP_WORKER_URL!

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

export async function connectWhatsApp(clientId: string, accountId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_connections')
    .upsert(
      {
        workspace_id: membership!.workspace_id,
        client_id: clientId,
        account_id: accountId,
        status: 'connecting',
      },
      { onConflict: 'workspace_id,client_id,account_id' }
    )

  if (dbError) return { error: 'Erro ao salvar conexão' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true, workspaceId: membership!.workspace_id }
}

export async function confirmWhatsAppConnected(clientId: string, accountId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_connections')
    .update({ status: 'connected', connected_at: new Date().toISOString() })
    .eq('workspace_id', membership!.workspace_id)
    .eq('client_id', clientId)
    .eq('account_id', accountId)

  if (dbError) return { error: 'Erro ao confirmar conexão' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}

export async function disconnectWhatsApp(clientId: string, accountId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  try {
    await fetch(`${WORKER_URL}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: membership!.workspace_id,
        account_id: accountId,
      }),
    })
  } catch (err) {
    // Worker pode estar offline — atualiza status no banco mesmo assim
    console.error('Worker disconnect falhou:', err)
  }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_connections')
    .update({ status: 'disconnected', connected_at: null })
    .eq('workspace_id', membership!.workspace_id)
    .eq('client_id', clientId)
    .eq('account_id', accountId)

  if (dbError) return { error: 'Erro ao atualizar status' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}

export async function resetCircuitBreaker(clientId: string, accountId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_accounts')
    .update({ cb_paused_at: null, cb_failure_count: 0, status: 'disconnected' })
    .eq('workspace_id', membership!.workspace_id)
    .eq('account_id', accountId)

  if (dbError) return { error: 'Erro ao resetar circuit breaker' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}

export async function saveNoticeTemplate(
  clientId: string,
  accountId: string,
  template: string
) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_connections')
    .update({ notice_template: template })
    .eq('workspace_id', membership!.workspace_id)
    .eq('client_id', clientId)
    .eq('account_id', accountId)

  if (dbError) return { error: 'Erro ao salvar template' }
  return { success: true }
}
