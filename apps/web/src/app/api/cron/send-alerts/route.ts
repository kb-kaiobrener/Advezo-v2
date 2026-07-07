import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'

export const dynamic = 'force-dynamic'

/**
 * Cron de alertas proativos de saldo via WhatsApp (Story 3.6) — a cada 15 min.
 *
 * Dedup (AC 3.6.2): claim atômico — UPDATE alerts SET whatsapp_sent_at = now()
 * WHERE id = X AND whatsapp_sent_at IS NULL RETURNING id. Só um processo
 * concorrente recebe a linha; retry/restart nunca reenvia o mesmo alerta.
 * Falha no worker desfaz o claim (AC 3.6.3) — alerta volta a ser elegível.
 *
 * Sem embed PostgREST entre alerts e whatsapp_accounts (não há FK): duas
 * consultas cruzadas em código por workspace_id. Join com ad_accounts é
 * válido (FK real alerts.ad_account_id → ad_accounts.id).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: alerts, error: alertsError } = await supabase
    .from('alerts')
    .select(`
      id, workspace_id, ad_account_id, alert_type, threshold_days, projected_days,
      ad_accounts!inner(account_name)
    `)
    .is('resolved_at', null)
    .is('whatsapp_sent_at', null)

  if (alertsError) {
    return NextResponse.json({ error: 'Erro ao buscar alertas' }, { status: 500 })
  }
  if (!alerts?.length) return NextResponse.json({ processed: 0 })

  const workspaceIds = [...new Set(alerts.map((a) => a.workspace_id))]
  const { data: waAccounts } = await supabase
    .from('whatsapp_accounts')
    .select('workspace_id, account_id, alert_destination_type, alert_destination_id')
    .in('workspace_id', workspaceIds)
    .eq('status', 'connected')
    .not('alert_destination_id', 'is', null)

  const waByWorkspace = new Map<string, { account_id: string; alert_destination_id: string }>()
  for (const wa of waAccounts ?? []) {
    if (!waByWorkspace.has(wa.workspace_id)) {
      waByWorkspace.set(wa.workspace_id, {
        account_id: wa.account_id,
        alert_destination_id: wa.alert_destination_id as string,
      })
    }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const alert of alerts) {
    const wa = waByWorkspace.get(alert.workspace_id)
    // Sem conta conectada ou sem destino configurado — skip silencioso (AC 3.6.5)
    if (!wa) {
      skipped++
      continue
    }

    // Claim atômico — marca como enviado ANTES de chamar o worker (AC 3.6.2)
    const { data: claimed } = await supabase
      .from('alerts')
      .update({
        whatsapp_sent_at: new Date().toISOString(),
        whatsapp_destination_id: wa.alert_destination_id,
      })
      .eq('id', alert.id)
      .is('whatsapp_sent_at', null)
      .select('id')
      .maybeSingle()

    if (!claimed) {
      skipped++ // outro processo já enviou
      continue
    }

    const adAccount = Array.isArray(alert.ad_accounts) ? alert.ad_accounts[0] : alert.ad_accounts
    const projectedDays = Math.round(Number(alert.projected_days))
    const projectedDate = new Date()
    projectedDate.setDate(projectedDate.getDate() + projectedDays)
    const dataFormatada = projectedDate.toLocaleDateString('pt-BR')

    const text = [
      `⚠️ Alerta de Saldo — ${adAccount.account_name}`,
      `Saldo projetado para esgotar em ${projectedDays} dias.`,
      `Limite configurado: ${alert.threshold_days} dias de veiculação.`,
      `Ação sugerida: recarregue o saldo da conta antes de ${dataFormatada}.`,
    ].join('\n')

    let workerOk = false
    let workerError = 'worker inacessível'
    try {
      const workerRes = await fetch(`${process.env.WHATSAPP_WORKER_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: alert.workspace_id,
          account_id: wa.account_id,
          to: wa.alert_destination_id,
          text,
        }),
      })
      workerOk = workerRes.ok
      if (!workerRes.ok) {
        workerError = (await workerRes.text().catch(() => 'erro desconhecido')).slice(0, 500)
      }
    } catch {
      // workerError já é 'worker inacessível'
    }

    if (workerOk) {
      // Claim já registra o envio — só limpa eventual erro de tentativa anterior
      await supabase.from('alerts').update({ whatsapp_last_error: null }).eq('id', alert.id)
      sent++
    } else {
      // Rollback do claim (AC 3.6.3) — alerta volta a ser elegível no próximo ciclo
      await supabase
        .from('alerts')
        .update({ whatsapp_sent_at: null, whatsapp_last_error: workerError })
        .eq('id', alert.id)
      failed++
    }
  }

  return NextResponse.json({ processed: alerts.length, sent, skipped, failed })
}
