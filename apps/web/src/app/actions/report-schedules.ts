'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { generateReport } from '@/lib/whatsapp/report-generator'

export type ReportFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type ReportDestinationType = 'individual' | 'group'

export interface ReportSchedule {
  id: string
  workspace_id: string
  client_id: string
  frequency: ReportFrequency
  send_day: number | null
  send_time: string
  destination_type: ReportDestinationType
  destination_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReportScheduleInput {
  frequency: ReportFrequency
  send_day: number | null
  send_time: string
  destination_type: ReportDestinationType
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

export async function saveReportSchedule(clientId: string, data: ReportScheduleInput) {
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
    .from('report_schedules')
    .upsert(
      {
        workspace_id: membership!.workspace_id,
        client_id: clientId,
        frequency: data.frequency,
        send_day: data.send_day,
        send_time: data.send_time,
        destination_type: data.destination_type,
        destination_id: data.destination_id,
      },
      { onConflict: 'workspace_id,client_id' }
    )

  if (dbError) return { error: 'Erro ao salvar configuração' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}

export async function toggleReportSchedule(
  scheduleId: string,
  clientId: string,
  isActive: boolean
) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('report_schedules')
    .update({ is_active: isActive })
    .eq('id', scheduleId)
    .eq('workspace_id', membership!.workspace_id)

  if (dbError) return { error: 'Erro ao atualizar status' }
  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true }
}

export async function previewReport(
  clientId: string
): Promise<{ text?: string; error?: string }> {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 30)

  try {
    const text = await generateReport(membership!.workspace_id, clientId, { from, to })
    return { text }
  } catch {
    return { error: 'Erro ao gerar pré-visualização' }
  }
}
