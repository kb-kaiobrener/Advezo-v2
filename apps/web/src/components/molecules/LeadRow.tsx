'use client'

import { useState } from 'react'
import { LeadStatusBadge } from '@/components/molecules/LeadStatusBadge'
import { LeadSourceBadge } from '@/components/molecules/LeadSourceBadge'
import { ConsentBadge } from '@/components/molecules/ConsentBadge'
import { LeadActions } from '@/components/molecules/LeadActions'
import { cn } from '@/lib/utils'
import type { LeadDisplay } from '@/types/leads'
import type { LeadStatus } from '@advezo/types'

/**
 * Linha de lead na lista (Story 8.8 — AC 8.8.2 / 8.8.4 / 8.8.5 / 8.8.6 / 8.8.7).
 *
 * Client Component: mantém o status otimista (refletido no badge ao disparar uma ação
 * antes da confirmação server) e expõe seleção (checkbox para bulk) + abertura do detalhe.
 *
 * O telefone é sempre exibido mascarado: `leads.phone_hash` é HMAC-SHA256 irreversível —
 * não há coluna de telefone legível no schema (decisão de privacidade, ver Dev Notes da
 * story). Exibimos "••••" como placeholder. O email já chega descriptografado (ou null).
 */

const PHONE_MASK = '••••'

interface LeadRowProps {
  lead: LeadDisplay
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (lead: LeadDisplay) => void
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function LeadRow({
  lead,
  selected,
  onToggleSelect,
  onOpenDetail,
}: LeadRowProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<LeadStatus>(lead.status)

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_2fr_1fr_auto_auto_auto_1fr_auto] items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm',
        selected && 'ring-1 ring-brand-600'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(lead.id)}
        aria-label={`Selecionar lead ${lead.name}`}
        className="size-4 rounded border-border"
      />

      <button
        type="button"
        onClick={() => onOpenDetail(lead)}
        className="min-w-0 text-left"
      >
        <p className="truncate font-medium text-foreground hover:text-brand-600">
          {lead.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {lead.email ?? '—'}
        </p>
      </button>

      <span className="text-muted-foreground">{PHONE_MASK}</span>

      <LeadSourceBadge source={lead.source} />

      <LeadStatusBadge status={optimisticStatus} />

      <ConsentBadge consentGivenAt={lead.consent_given_at} source={lead.source} />

      <span className="text-right text-xs text-muted-foreground">
        {dateFormatter.format(new Date(lead.created_at))}
      </span>

      <div className="flex justify-end">
        <LeadActions
          leadId={lead.id}
          status={optimisticStatus}
          onOptimisticStatus={setOptimisticStatus}
        />
      </div>
    </div>
  )
}
