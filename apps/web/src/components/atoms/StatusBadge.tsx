import { cn } from '@/lib/utils'

type Status = 'good' | 'warning' | 'critical'

const statusConfig: Record<Status, { label: string; className: string }> = {
  good:     { label: 'Saudável', className: 'bg-health-good-bg text-health-good-text' },
  warning:  { label: 'Atenção',  className: 'bg-health-warning-bg text-health-warning-text' },
  critical: { label: 'Crítico',  className: 'bg-health-critical-bg text-health-critical-text' },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, className: statusClass } = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        statusClass,
        className
      )}
    >
      {label}
    </span>
  )
}
