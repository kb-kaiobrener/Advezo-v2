import { notFound } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { WhatsAppConnectionList } from '@/components/molecules/WhatsAppConnectionList'
import { ConnectNewWhatsApp } from '@/components/molecules/ConnectNewWhatsApp'
import { ReportScheduleForm } from '@/components/molecules/ReportScheduleForm'
import { DashboardConfigForm, type DashboardConfig } from '@/components/molecules/DashboardConfigForm'
import type { ReportSchedule } from '@/app/actions/report-schedules'
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

  const [{ data: client }, { data: connections }, { data: schedule }, { data: dashboardConfig }] = await Promise.all([
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
  ])

  if (!client) return null

  return {
    client: client as Client,
    workspaceId: membership.workspace_id,
    connections: connections ?? [],
    schedule: (schedule as ReportSchedule | null) ?? null,
    dashboardConfig: (dashboardConfig as DashboardConfig | null) ?? null,
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

  const { client, workspaceId, connections, schedule, dashboardConfig } = data

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
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Envio Automático de Relatório</h2>

        <ReportScheduleForm clientId={id} initialSchedule={schedule} />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Dashboard Compartilhável</h2>

        <DashboardConfigForm clientId={id} config={dashboardConfig} />
      </section>
    </div>
  )
}
