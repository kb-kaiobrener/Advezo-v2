'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { LeadStatusBadge } from '@/components/molecules/LeadStatusBadge'
import { LeadSourceBadge } from '@/components/molecules/LeadSourceBadge'
import { ConsentBadge } from '@/components/molecules/ConsentBadge'
import type { LeadDisplay } from '@/types/leads'

/**
 * Painel lateral (sheet) de detalhe do lead (Story 8.8 — AC 8.8.8).
 *
 * Implementado como overlay + slide-over em CSS puro (sem dependência de Radix/Sheet
 * — não disponível no design system e fora do escopo desta story). Recebe apenas o
 * LeadDisplay (email já descriptografado server-side; email_encrypted NUNCA presente).
 *
 * Badge de CAPI: reflete `capiSent` — se o evento `Lead` foi enviado à Meta CAPI
 * (conversion_events.status='sent'). Quando a tabela conversion_events ainda não existe
 * (epic futuro), `capiSent` chega como null → badge "—" (indisponível).
 */

const PHONE_MASK = '••••' // phone_hash não é reversível; ver Dev Notes / AC 8.8.2

interface LeadDetailSheetProps {
  lead: LeadDisplay | null
  onClose: () => void
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

export function LeadDetailSheet({ lead, onClose }: LeadDetailSheetProps) {
  // Fecha com Escape.
  useEffect(() => {
    if (!lead) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lead, onClose])

  if (!lead) return null

  const fieldEntries = Object.entries(lead.field_data ?? {})

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalhe do lead">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{lead.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status} />
            <LeadSourceBadge source={lead.source} />
            <ConsentBadge consentGivenAt={lead.consent_given_at} source={lead.source} />
          </div>

          <Field label="Telefone">{PHONE_MASK}</Field>
          <Field label="Email">{lead.email ?? '—'}</Field>
          <Field label="Data de criação">{formatDateTime(lead.created_at)}</Field>
          <Field label="Qualificado em">{formatDateTime(lead.qualified_at)}</Field>
          <Field label="Convertido em">{formatDateTime(lead.converted_at)}</Field>

          <Field label="Meta Conversions API (evento Lead)">
            {lead.capiSent === null ? (
              <span className="text-muted-foreground">—</span>
            ) : lead.capiSent ? (
              <span className="inline-flex items-center rounded-sm bg-health-good-bg px-2 py-0.5 text-xs font-medium text-health-good-text">
                Enviado
              </span>
            ) : (
              <span className="inline-flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Não enviado
              </span>
            )}
          </Field>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Campos do formulário
            </p>
            {fieldEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum campo adicional</p>
            ) : (
              <dl className="space-y-2 rounded-md border border-border p-3">
                {fieldEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="break-all text-right text-foreground">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
