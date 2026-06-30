import { ShieldCheck, BadgeInfo } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeadSource } from '@advezo/types'

/**
 * Badge de base legal / consentimento LGPD do lead (Story 8.8 — AC 8.8.5).
 *
 * Três estados:
 *  1. consent_given_at NOT NULL  → Shield verde + tooltip "Consentimento explícito
 *     registrado em {data}". Base legal: consentimento explícito (LP).
 *  2. source='lead_ads' e consent_given_at IS NULL → BadgeInfo azul + "Meta Terms".
 *     Base legal diferente: termos de uso da Meta.
 *  3. Sem consent e não-lead_ads → não renderiza badge (retorna null).
 *
 * Tooltip implementado em CSS puro (group-hover) — o design system ainda não tem
 * componente Tooltip e a story não autoriza adicionar dependência (Radix/etc).
 */

interface ConsentBadgeProps {
  consentGivenAt: string | null
  source: LeadSource
  className?: string
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const tooltipClass =
  'pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100'

export function ConsentBadge({
  consentGivenAt,
  source,
  className,
}: ConsentBadgeProps) {
  if (consentGivenAt) {
    const formatted = dateFormatter.format(new Date(consentGivenAt))
    return (
      <span className={cn('group relative inline-flex', className)}>
        <ShieldCheck
          className="size-4 text-health-good-text"
          aria-label={`Consentimento explícito registrado em ${formatted}`}
        />
        <span role="tooltip" className={tooltipClass}>
          Consentimento explícito registrado em {formatted}
        </span>
      </span>
    )
  }

  if (source === 'lead_ads') {
    return (
      <span className={cn('group relative inline-flex', className)}>
        <span className="inline-flex items-center gap-1 rounded-sm bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          <BadgeInfo className="size-3" aria-hidden="true" />
          Meta Terms
        </span>
        <span role="tooltip" className={tooltipClass}>
          Base legal: termos de uso da Meta (sem consentimento explícito)
        </span>
      </span>
    )
  }

  return null
}
