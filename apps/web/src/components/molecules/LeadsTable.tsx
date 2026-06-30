'use client'

import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { LeadRow } from '@/components/molecules/LeadRow'
import { LeadDetailSheet } from '@/components/molecules/LeadDetailSheet'
import { bulkUpdateLeadStatus } from '@/app/actions/leads'
import { cn } from '@/lib/utils'
import type { LeadDisplay } from '@/types/leads'

/**
 * Tabela de leads com seleção, bulk actions e detalhe (Story 8.8 — AC 8.8.2/8.8.6/
 * 8.8.7/8.8.8).
 *
 * Client island montada pela página `/leads` (Server Component) já com os leads
 * descriptografados (LeadDisplay — sem email_encrypted). Mantém:
 *  - conjunto de seleção (checkbox por linha + selecionar todos);
 *  - barra de bulk actions ("Qualificar selecionados" / "Descartar selecionados")
 *    chamando bulkUpdateLeadStatus, com toast de resultado ("3 leads qualificados,
 *    1 erro");
 *  - estado do sheet de detalhe.
 *
 * Toast: implementado inline (sem lib externa) — auto-dismiss após 4s.
 */

interface LeadsTableProps {
  leads: LeadDisplay[]
}

interface ToastState {
  message: string
  tone: 'success' | 'error'
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailLead, setDetailLead] = useState<LeadDisplay | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isPending, startTransition] = useTransition()

  const allSelected = leads.length > 0 && selected.size === leads.length

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))
    )
  }

  function showToast(state: ToastState) {
    setToast(state)
    setTimeout(() => setToast(null), 4000)
  }

  function runBulk(status: 'qualificado' | 'desqualificado') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startTransition(async () => {
      const { updated, errors } = await bulkUpdateLeadStatus(ids, status)
      const verb = status === 'qualificado' ? 'qualificados' : 'descartados'
      const parts = [`${updated} leads ${verb}`]
      if (errors.length > 0) {
        parts.push(`${errors.length} ${errors.length === 1 ? 'erro' : 'erros'}`)
      }
      showToast({
        message: parts.join(', '),
        tone: errors.length > 0 ? 'error' : 'success',
      })
      setSelected(new Set())
    })
  }

  return (
    <div className="space-y-3">
      {/* Header: selecionar todos + bulk actions */}
      <div className="flex flex-wrap items-center gap-3 px-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Selecionar todos os leads"
            className="size-4 rounded border-border"
          />
          {selected.size > 0
            ? `${selected.size} selecionado${selected.size > 1 ? 's' : ''}`
            : 'Selecionar todos'}
        </label>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runBulk('qualificado')}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-health-good-bg px-3 py-1.5 text-xs font-medium text-health-good-text hover:opacity-90 disabled:opacity-50"
            >
              <Check className="size-3.5" />
              Qualificar selecionados
            </button>
            <button
              type="button"
              onClick={() => runBulk('desqualificado')}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-health-critical-bg px-3 py-1.5 text-xs font-medium text-health-critical-text hover:opacity-90 disabled:opacity-50"
            >
              <X className="size-3.5" />
              Descartar selecionados
            </button>
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {leads.map((lead) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            selected={selected.has(lead.id)}
            onToggleSelect={toggleSelect}
            onOpenDetail={setDetailLead}
          />
        ))}
      </div>

      <LeadDetailSheet lead={detailLead} onClose={() => setDetailLead(null)} />

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-6 right-6 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg',
            toast.tone === 'success'
              ? 'bg-health-good-bg text-health-good-text'
              : 'bg-health-warning-bg text-health-warning-text'
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
