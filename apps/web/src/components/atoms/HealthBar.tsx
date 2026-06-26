import { cn } from '@/lib/utils'

interface HealthBarProps {
  value: number
  className?: string
  showLabel?: boolean
}

function getHealthColor(value: number): string {
  if (value >= 70) return 'bg-health-good'
  if (value >= 40) return 'bg-health-warning'
  return 'bg-health-critical'
}

export function HealthBar({ value, className, showLabel = false }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const colorClass = getHealthColor(clamped)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorClass)}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-gray-600 w-8 text-right">{clamped}%</span>
      )}
    </div>
  )
}
