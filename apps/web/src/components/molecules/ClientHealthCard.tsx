import { StatusBadge } from '@/components/atoms/StatusBadge'
import { HealthBar } from '@/components/atoms/HealthBar'
import { PlatformIcon } from '@/components/atoms/PlatformIcon'

export interface ClientHealthData {
  clientId: string
  clientName: string
  logoUrl?: string
  healthScore: number // 0-100
  roas: number
  spend: number
  budget: number
  platform?: 'meta' | 'google'
}

type HealthStatus = 'good' | 'warning' | 'critical'

function getHealthStatus(score: number): HealthStatus {
  if (score >= 70) return 'good'
  if (score >= 40) return 'warning'
  return 'critical'
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

interface ClientHealthCardProps {
  data: ClientHealthData
}

export function ClientHealthCard({ data }: ClientHealthCardProps) {
  const status = getHealthStatus(data.healthScore)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
          {getInitials(data.clientName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-card-foreground">{data.clientName}</p>
        </div>
        {data.platform && <PlatformIcon platform={data.platform} size="sm" />}
        <StatusBadge status={status} />
      </div>

      <HealthBar value={data.healthScore} showLabel />

      <div className="flex items-center justify-between text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">ROAS</span>
          <span className="font-medium text-card-foreground">{data.roas.toFixed(1)}x</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-xs text-muted-foreground">Gasto / Budget</span>
          <span className="font-medium text-card-foreground">
            R$ {data.spend.toFixed(2)} / R$ {data.budget.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
