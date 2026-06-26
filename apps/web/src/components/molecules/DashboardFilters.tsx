'use client'

import { useState } from 'react'

interface ClientOption {
  id: string
  name: string
}

interface DashboardFiltersProps {
  clients: ClientOption[]
}

const selectClass =
  'h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-1'

export function DashboardFilters({ clients }: DashboardFiltersProps) {
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [period, setPeriod] = useState<string>('30d')

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label="Filtrar por cliente"
        value={selectedClient}
        onChange={(e) => setSelectedClient(e.target.value)}
        className={selectClass}
      >
        <option value="all">Todos os clientes</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por período"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className={selectClass}
      >
        <option value="today">Hoje</option>
        <option value="7d">7 dias</option>
        <option value="30d">30 dias</option>
        <option value="90d">90 dias</option>
      </select>
    </div>
  )
}
