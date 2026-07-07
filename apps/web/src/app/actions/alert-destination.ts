'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

export type AlertDestinationType = 'individual' | 'group'

export interface AlertDestinationInput {
  destination_type: AlertDestinationType
  destination_id: string
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
 * Salva o destino de alertas de saldo da conta WhatsApp (Story 3.6, AC 3.6.7).
 * Independente do destino de relatórios (report_schedules).
 */
export async function saveAlertDestination(
  accountId: string,
  clientId: string,
  data: AlertDestinationInput
) {
  // Validação server-side de formato ANTES de auth — espelha Story 3.3
  if (data.destination_type === 'individual') {
    const normalized = data.destination_id.replace(/[+\s]/g, '')
    if (!/^\d{10,15}$/.test(normalized)) {
      return { error: 'Número individual inválido — use formato E.164 (ex: 5511999998888)' }
    }
  } else {
    if (!/^\d+@g\.us$/.test(data.destination_id)) {
      return { error: 'JID de grupo inválido — use formato XXXXXXXXXX@g.us' }
    }
  }

  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('whatsapp_accounts')
    .update({
      alert_destination_type: data.destination_type,
      alert_destination_id: data.destination_id,
    })
    .eq('id', accountId)
    .eq('workspace_id', membership!.workspace_id)

  if (dbError) return { error: 'Erro ao salvar destino de alertas' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}
