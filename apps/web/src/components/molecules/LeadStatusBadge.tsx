import { cn } from '@/lib/utils'
import type { LeadStatus } from '@advezo/types'

/**
 * Badge colorido por status de lead (Story 8.8 — AC 8.8.2).
 *
 * Mapa de cores conforme Dev Notes da story:
 *   novo          → cinza
 *   qualificado   → verde
 *   desqualificado→ vermelho
 *   convertido    → azul
 *
 * Reutiliza os tokens de cor do design system (health-* / gray) já usados em
 * StatusBadge e CampaignRow do Epic 1/2.
 */

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-gray-100 text-gray-600' },
  qualificado: {
    label: 'Qualificado',
    className: 'bg-health-good-bg text-health-good-text',
  },
  desqualificado: {
    label: 'Desqualificado',
    className: 'bg-health-critical-bg text-health-critical-text',
  },
  convertido: { label: 'Convertido', className: 'bg-blue-100 text-blue-700' },
}

interface LeadStatusBadgeProps {
  status: LeadStatus
  className?: string
}

export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const { label, className: statusClass } = STATUS_CONFIG[status]
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
