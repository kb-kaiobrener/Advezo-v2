import { notFound } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { WhatsAppConnectionList } from '@/components/molecules/WhatsAppConnectionList'
import { ConnectNewWhatsApp } from '@/components/molecules/ConnectNewWhatsApp'
import { ReportScheduleForm } from '@/components/molecules/ReportScheduleForm'
import { ReportSendHistory } from '@/components/molecules/ReportSendHistory'
import { AlertDestinationForm } from '@/components/molecules/AlertDestinationForm'
import type { AlertDestinationType } from '@/app/actions/alert-destination'
import { DashboardConfigForm, type DashboardConfig } from '@/components/molecules/DashboardConfigForm'
import type { ReportSchedule } from '@/app/actions/report-schedules'
import type { ReportLog } from '@/app/actions/report-send'
import type { Client } from '@advezo/types'

async function getPageData(clientId: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createSupabaseServiceClient()

  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return null

  const [{ data: client }, { data: connections }, { data: schedule }, { data: dashboardConfig }, { data: reportLogs }, { data: waAccount }] = await Promise.all([
    serviceClient
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .is('deleted_at', null)
      .single(),
    serviceClient
      .from('whatsapp_connections')
      .select('*, whatsapp_accounts(cb_paused_at, cb_failure_count)')
      .eq('client_id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .order('created_at', { ascending: true }),
    serviceClient
      .from('report_schedules')
      .select('*')
      .eq('client_id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .maybeSingle(),
    serviceClient
      .from('dashboard_configs')
      .select('*')
      .eq('client_id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .maybeSingle(),
    serviceClient
      .from('report_logs')
      .select('*')
      .eq('client_id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .order('created_at', { ascending: false })
      .limit(5),
    serviceClient
      .from('whatsapp_accounts')
      .select('id, alert_destination_type, alert_destination_id')
      .eq('workspace_id', membership.workspace_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!client) return null

  return {
    client: client as Client,
    workspaceId: membership.workspace_id,
    connections: connections ?? [],
    schedule: (schedule as ReportSchedule | null) ?? null,
    dashboardConfig: (dashboardConfig as DashboardConfig | null) ?? null,
    reportLogs: (reportLogs as ReportLog[] | null) ?? [],
    waAccount: (waAccount as {
      id: string
      alert_destination_type: AlertDestinationType | null
      alert_destination_id: string | null
    } | null) ?? null,
  }
}

export default async function ClientConfiguracoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getPageData(id)
  if (!data) notFound()

  const { client, workspaceId, connections, schedule, dashboardConfig, reportLogs, waAccount } = data

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{client.name}</h1>
        <p className="text-sm text-muted-foreground">Configurações</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">WhatsApp</h2>

        <ConnectNewWhatsApp clientId={id} workspaceId={workspaceId} />

        <WhatsAppConnectionList
          clientId={id}
          workspaceId={workspaceId}
          connections={connections as Parameters<typeof WhatsAppConnectionList>[0]['connections']}
        />

        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">Destino de Alertas</h3>
          <AlertDestinationForm
            clientId={id}
            accountId={waAccount?.id ?? null}
            initialType={waAccount?.alert_destination_type ?? null}
            initialDestination={waAccount?.alert_destination_id ?? null}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Envio Automático de Relatório</h2>

        <ReportScheduleForm clientId={id} initialSchedule={schedule} />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Histórico de Envios</h2>

        <ReportSendHistory
          clientId={id}
          scheduleId={schedule?.is_active ? schedule.id : null}
          logs={reportLogs}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Dashboard Compartilhável</h2>

        <DashboardConfigForm clientId={id} config={dashboardConfig} />
      </section>
    </div>
  )
}
