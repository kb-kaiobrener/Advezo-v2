import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'
import { generateReport } from '@/lib/whatsapp/report-generator'
import { scheduleShouldFireNow, computePeriod } from '@/lib/reports/schedule-utils'

export const dynamic = 'force-dynamic'

/**
 * Cron de envio de relatórios (Story 3.5) — roda de hora em hora via Vercel Cron.
 *
 * Dedup (AC 3.5.2): INSERT em report_logs com ON CONFLICT (schedule_id, period_start)
 * DO NOTHING. Se o insert não retornar linha, o período já foi processado — skip.
 * Sem embed PostgREST entre report_schedules e whatsapp_accounts (não há FK):
 * duas consultas cruzadas em código por workspace_id.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const now = new Date()

  const { data: schedules, error: schedulesError } = await supabase
    .from('report_schedules')
    .select('id, workspace_id, client_id, frequency, send_day, send_time, destination_type, destination_id')
    .eq('is_active', true)

  if (schedulesError) {
    return NextResponse.json({ error: 'Erro ao buscar schedules' }, { status: 500 })
  }
  if (!schedules?.length) return NextResponse.json({ processed: 0 })

  const workspaceIds = [...new Set(schedules.map((s) => s.workspace_id))]
  const { data: waAccounts } = await supabase
    .from('whatsapp_accounts')
    .select('workspace_id, account_id')
    .in('workspace_id', workspaceIds)
    .eq('status', 'connected')

  // 1ª conta conectada por workspace (multi-conta com preferência é trabalho futuro)
  const waByWorkspace = new Map<string, { account_id: string }>()
  for (const wa of waAccounts ?? []) {
    if (!waByWorkspace.has(wa.workspace_id)) waByWorkspace.set(wa.workspace_id, wa)
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const s of schedules) {
    if (!scheduleShouldFireNow(s, now)) {
      skipped++
      continue
    }

    const waAccount = waByWorkspace.get(s.workspace_id)
    if (!waAccount) {
      skipped++
      continue
    }

    const { period_start, period_end } = computePeriod(s.frequency, now)

    // Dedup atômico — conflito em (schedule_id, period_start) significa já processado
    const { data: log } = await supabase
      .from('report_logs')
      .upsert(
        {
          workspace_id: s.workspace_id,
          client_id: s.client_id,
          schedule_id: s.id,
          period_start,
          period_end,
          destination_type: s.destination_type,
          destination_id: s.destination_id,
          status: 'pending',
        },
        { onConflict: 'schedule_id,period_start', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle()

    if (!log) {
      skipped++
      continue
    }

    try {
      const text = await generateReport(s.workspace_id, s.client_id, {
        from: new Date(period_start),
        to: new Date(period_end),
      })

      const workerRes = await fetch(`${process.env.WHATSAPP_WORKER_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: s.workspace_id,
          account_id: waAccount.account_id,
          to: s.destination_id,
          text,
        }),
      })

      if (workerRes.ok) {
        await supabase
          .from('report_logs')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', log.id)
        sent++
      } else {
        const err = await workerRes.text().catch(() => 'erro desconhecido')
        await supabase
          .from('report_logs')
          .update({ status: 'failed', error_message: err.slice(0, 500) })
          .eq('id', log.id)
        failed++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido'
      await supabase
        .from('report_logs')
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', log.id)
      failed++
    }
  }

  return NextResponse.json({ processed: schedules.length, sent, skipped, failed })
}
