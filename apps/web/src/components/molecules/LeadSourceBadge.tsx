import { cn } from '@/lib/utils'
import type { LeadSource } from '@advezo/types'

/**
 * Badge de origem do lead (Story 8.8 — AC 8.8.2).
 *   landing_page → "LP"
 *   lead_ads     → "Lead Ads"
 */

const SOURCE_CONFIG: Record<LeadSource, { label: string; className: string }> = {
  landing_page: { label: 'LP', className: 'bg-brand-100 text-brand-700' },
  lead_ads: { label: 'Lead Ads', className: 'bg-purple-100 text-purple-700' },
}

interface LeadSourceBadgeProps {
  source: LeadSource
  className?: string
}

export function LeadSourceBadge({ source, className }: LeadSourceBadgeProps) {
  const { label, className: sourceClass } = SOURCE_CONFIG[source]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        sourceClass,
        className
      )}
    >
      {label}
    </span>
  )
}
