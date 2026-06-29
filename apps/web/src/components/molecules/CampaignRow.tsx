import { PlatformIcon } from '@/components/atoms/PlatformIcon'
import { CampaignActions } from '@/components/molecules/CampaignActions'
import { cn } from '@/lib/utils'

export interface CampaignRowProps {
  campaignId: string // ad_campaigns.id (UUID) — usado pelas Server Actions inline
  platform: 'meta' | 'google'
  name: string
  status: string
  budget: number | null
  dailyBudget: number | null // orçamento diário editável (distinto de lifetime)
  spend7d: number
  accountName: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-health-good-bg text-health-good-text' },
  paused: { label: 'Pausada', className: 'bg-health-warning-bg text-health-warning-text' },
  deleted: { label: 'Excluída', className: 'bg-health-critical-bg text-health-critical-text' },
  archived: { label: 'Arquivada', className: 'bg-gray-100 text-gray-600' },
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return currencyFormatter.format(value)
}

export function CampaignRow({
  campaignId,
  platform,
  name,
  status,
  budget,
  dailyBudget,
  spend7d,
  accountName,
}: CampaignRowProps) {
  const statusStyle = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="grid grid-cols-[auto_2fr_auto_1fr_1fr_auto] items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <div className="flex items-center justify-center">
        <PlatformIcon platform={platform} size="md" />
      </div>

      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{accountName}</p>
      </div>

      <span
        className={cn(
          'inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-xs font-medium',
          statusStyle.className
        )}
      >
        {statusStyle.label}
      </span>

      <div className="text-right">
        <p className="text-xs text-muted-foreground">Orçamento</p>
        <p className="font-medium text-foreground">{formatCurrency(budget)}</p>
      </div>

      <div className="text-right">
        <p className="text-xs text-muted-foreground">Gasto 7d</p>
        <p className="font-medium text-foreground">{formatCurrency(spend7d)}</p>
      </div>

      <CampaignActions
        campaignId={campaignId}
        status={status}
        currentBudget={dailyBudget}
      />
    </div>
  )
}
