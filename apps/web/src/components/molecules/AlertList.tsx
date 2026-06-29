'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveAlert } from '@/app/actions/alerts'

/**
 * AlertList (Story 2.9 — AC 2.9.5)
 *
 * Lista os alertas ATIVOS de uma conta na página de integrações, cada um com o tipo,
 * a data de criação e um botão "Marcar como resolvido" que chama a Server Action
 * resolveAlert (AC 2.9.6b — resolução manual). Sem alertas ativos, não renderiza nada.
 *
 * Client Component (precisa de useTransition/estado para o botão). Recebe os alertas
 * já filtrados pelo Server Component pai (sem colunas sensíveis).
 */

export interface AlertListItem {
  id: string
  alert_type: 'low_balance'
  projected_days: number
  created_at: string
}

const ALERT_LABEL: Record<AlertListItem['alert_type'], string> = {
  low_balance: 'Saldo baixo',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

interface AlertRowProps {
  alert: AlertListItem
}

function AlertRow({ alert }: AlertRowProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleResolve() {
    setError(null)
    startTransition(async () => {
      const result = await resolveAlert(alert.id)
      if (result?.error) setError(result.error)
    })
  }

  const projectedLabel =
    Number.isFinite(alert.projected_days) && alert.projected_days >= 0
      ? `~${Math.floor(alert.projected_days)} dia(s) de saldo`
      : null

  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-amber-900">
            {ALERT_LABEL[alert.alert_type]}
          </p>
          <p className="truncate text-xs text-amber-700">
            {projectedLabel ? `${projectedLabel} · ` : ''}
            Criado em {formatDate(alert.created_at)}
          </p>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleResolve}
      >
        <Check className="h-4 w-4" aria-hidden />
        {isPending ? 'Resolvendo…' : 'Marcar como resolvido'}
      </Button>
    </div>
  )
}

interface AlertListProps {
  alerts: AlertListItem[]
}

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}
    </div>
  )
}
