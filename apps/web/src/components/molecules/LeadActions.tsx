'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, Check, X, Trophy } from 'lucide-react'
import { updateLeadStatus } from '@/app/actions/leads'
import { cn } from '@/lib/utils'
import type { LeadStatus } from '@advezo/types'

/**
 * Ações de status por lead (Story 8.8 — AC 8.8.6).
 *
 * Dropdown com Qualificar / Descartar / Marcar como convertido. As ações disponíveis
 * derivam de VALID_NEXT_STATUSES (mesma máquina de estados da Server Action 8.4) — uma
 * ação só aparece se a transição for válida. Lead `convertido` (terminal) não exibe o
 * botão de ações (nada a fazer).
 *
 * Otimistic update: ao disparar, o status local muda imediatamente; se a Server Action
 * retornar erro, reverte e exibe a mensagem. O revalidatePath da action reconcilia o
 * estado server-rendered no próximo render.
 */

const VALID_NEXT_STATUSES: Record<LeadStatus, LeadStatus[]> = {
  novo: ['qualificado', 'desqualificado'],
  qualificado: ['desqualificado', 'convertido'],
  desqualificado: ['novo'],
  convertido: [],
}

const ACTION_LABELS: Record<
  LeadStatus,
  { label: string; icon: typeof Check; tone: 'good' | 'bad' | 'info' }
> = {
  qualificado: { label: 'Qualificar', icon: Check, tone: 'good' },
  desqualificado: { label: 'Descartar', icon: X, tone: 'bad' },
  convertido: { label: 'Marcar como convertido', icon: Trophy, tone: 'info' },
  novo: { label: 'Reativar', icon: Check, tone: 'info' },
}

const toneClass: Record<'good' | 'bad' | 'info', string> = {
  good: 'text-health-good-text hover:bg-health-good-bg',
  bad: 'text-health-critical-text hover:bg-health-critical-bg',
  info: 'text-blue-700 hover:bg-blue-50',
}

interface LeadActionsProps {
  leadId: string
  status: LeadStatus
  /** Notifica o pai (LeadRow) da mudança otimista para refletir o badge de status. */
  onOptimisticStatus?: (status: LeadStatus) => void
}

export function LeadActions({
  leadId,
  status,
  onOptimisticStatus,
}: LeadActionsProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const nextStatuses = VALID_NEXT_STATUSES[status] ?? []
  if (nextStatuses.length === 0) return null

  function handleSelect(target: LeadStatus) {
    setOpen(false)
    setError(null)
    const previous = status
    onOptimisticStatus?.(target) // otimista
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, target)
      if (result.error) {
        onOptimisticStatus?.(previous) // reverte
        setError(result.error)
      }
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ações do lead"
        className="flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {nextStatuses.map((target) => {
            const { label, icon: Icon, tone } = ACTION_LABELS[target]
            return (
              <button
                key={target}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(target)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                  toneClass[tone]
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
