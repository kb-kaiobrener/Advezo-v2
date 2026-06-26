import { Users, HeartPulse, AlertTriangle, AlertOctagon } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { DashboardFilters } from '@/components/molecules/DashboardFilters'
import { MetricCard } from '@/components/molecules/MetricCard'
import {
  ClientHealthCard,
  type ClientHealthData,
} from '@/components/molecules/ClientHealthCard'
import { EmptyState } from '@/components/molecules/EmptyState'

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .is('deleted_at', null)
    .order('name')

  const rows = clients ?? []

  // Health score é mockado nesta story (0). Lógica real vem no Epic 2.
  const healthData: ClientHealthData[] = rows.map((client) => ({
    clientId: client.id,
    clientName: client.name,
    healthScore: 0,
    roas: 0,
    spend: 0,
    budget: 0,
  }))

  const total = healthData.length
  const healthy = healthData.filter((c) => c.healthScore >= 70).length
  const warning = healthData.filter((c) => c.healthScore >= 40 && c.healthScore < 70).length
  const critical = healthData.filter((c) => c.healthScore < 40).length

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <DashboardFilters clients={rows.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard title="Total de Clientes Ativos" value={total} icon={Users} />
        <MetricCard title="Clientes Saudáveis" value={healthy} icon={HeartPulse} />
        <MetricCard title="Clientes em Atenção" value={warning} icon={AlertTriangle} />
        <MetricCard title="Clientes Críticos" value={critical} icon={AlertOctagon} />
      </div>

      {healthData.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ativo"
          subtitle="Cadastre clientes na seção Clientes para ver o dashboard"
          action={{ label: 'Ir para Clientes', href: '/clients' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {healthData.map((client) => (
            <ClientHealthCard key={client.clientId} data={client} />
          ))}
        </div>
      )}
    </div>
  )
}
