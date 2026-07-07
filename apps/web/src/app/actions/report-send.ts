'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { generateReport } from '@/lib/whatsapp/report-generator'

export type ReportLogStatus = 'pending' | 'sent' | 'failed'

export interface ReportLog {
  id: string
  workspace_id: string
  client_id: string
  schedule_id: string
  period_start: string
  period_end: string
  destination_type: 'individual' | 'group'
  destination_id: string
  status: ReportLogStatus
  sent_at: string | null
  error_message: string | null
  created_at: string
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

/** Busca a 1ª conta WhatsApp conectada do workspace. */
async function getConnectedAccount(workspaceId: string) {
  const serviceClient = createSupabaseServiceClient()
  const { data } = await serviceClient
    .from('whatsapp_accounts')
    .select('account_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  return data
}

async function sendViaWorker(params: {
  workspace_id: string
  account_id: string
  to: string
  text: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${process.env.WHATSAPP_WORKER_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (res.ok) return { ok: true }
    const err = await res.text().catch(() => 'erro desconhecido')
    return { ok: false, error: err.slice(0, 500) }
  } catch {
    return { ok: false, error: 'worker inacessível' }
  }
}

/**
 * Reenvio manual de um log existente (AC 3.5.5) — atualiza o próprio log,
 * sem passar pelo dedup do cron.
 */
export async function resendReport(logId: string, clientId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { data: log } = await serviceClient
    .from('report_logs')
    .select('id, workspace_id, client_id, schedule_id, period_start, period_end, destination_type, destination_id')
    .eq('id', logId)
    .eq('workspace_id', membership!.workspace_id)
    .maybeSingle()

  if (!log) return { error: 'Registro de envio não encontrado' }

  const account = await getConnectedAccount(membership!.workspace_id)
  if (!account) return { error: 'Nenhuma conta WhatsApp conectada' }

  let text: string
  try {
    text = await generateReport(log.workspace_id, log.client_id, {
      from: new Date(log.period_start),
      to: new Date(log.period_end),
    })
  } catch {
    return { error: 'Erro ao gerar relatório' }
  }

  const result = await sendViaWorker({
    workspace_id: log.workspace_id,
    account_id: account.account_id,
    to: log.destination_id,
    text,
  })

  await serviceClient
    .from('report_logs')
    .update(
      result.ok
        ? { status: 'sent', sent_at: new Date().toISOString(), error_message: null }
        : { status: 'failed', error_message: result.error }
    )
    .eq('id', log.id)

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return result.ok ? { success: true } : { error: `Falha no envio: ${result.error}` }
}

/**
 * Envio manual imediato (AC 3.5.7) — período fixo dos últimos 30 dias,
 * cria log novo sem dedup (envio explícito do gestor).
 */
export async function sendNow(scheduleId: string, clientId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { data: schedule } = await serviceClient
    .from('report_schedules')
    .select('id, workspace_id, client_id, destination_type, destination_id')
    .eq('id', scheduleId)
    .eq('workspace_id', membership!.workspace_id)
    .maybeSingle()

  if (!schedule) return { error: 'Configuração de envio não encontrada' }

  const account = await getConnectedAccount(membership!.workspace_id)
  if (!account) return { error: 'Nenhuma conta WhatsApp conectada' }

  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 30)

  let text: string
  try {
    text = await generateReport(schedule.workspace_id, schedule.client_id, { from, to })
  } catch {
    return { error: 'Erro ao gerar relatório' }
  }

  // Log novo — envio manual não usa a chave de dedup do cron. Se já existir log
  // do cron com o mesmo (schedule_id, period_start), o UNIQUE bloqueia; nesse
  // caso reaproveita o log existente via update.
  const periodStart = from.toISOString().split('T')[0]
  const periodEnd = to.toISOString().split('T')[0]

  const { data: log } = await serviceClient
    .from('report_logs')
    .upsert(
      {
        workspace_id: schedule.workspace_id,
        client_id: schedule.client_id,
        schedule_id: schedule.id,
        period_start: periodStart,
        period_end: periodEnd,
        destination_type: schedule.destination_type,
        destination_id: schedule.destination_id,
        status: 'pending',
      },
      { onConflict: 'schedule_id,period_start' }
    )
    .select('id')
    .maybeSingle()

  if (!log) return { error: 'Erro ao registrar envio' }

  const result = await sendViaWorker({
    workspace_id: schedule.workspace_id,
    account_id: account.account_id,
    to: schedule.destination_id,
    text,
  })

  await serviceClient
    .from('report_logs')
    .update(
      result.ok
        ? { status: 'sent', sent_at: new Date().toISOString(), error_message: null }
        : { status: 'failed', error_message: result.error }
    )
    .eq('id', log.id)

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return result.ok ? { success: true } : { error: `Falha no envio: ${result.error}` }
}
