'use client'

import { useState } from 'react'
import { reviewClassification, getConversationExcerpt, type FunnelStage } from '@/app/actions/classification-review'

interface Item {
  id: string; conversation_id: string; funnel_stage: string; is_sale: boolean
  sale_value_estimate: number | null; confidence_score: number
  origem: string; first_message_at: string | null
}

const STAGES: FunnelStage[] = ['awareness', 'interest', 'consideration', 'intent', 'sale']

export function ReviewList({ items }: { items: Item[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [excerpts, setExcerpts] = useState<Record<string, string[]>>({})
  const [msg, setMsg] = useState<string | null>(null)

  async function showExcerpt(convId: string) {
    const r = await getConversationExcerpt(convId)
    setExcerpts(e => ({ ...e, [convId]: r.excerpt ?? [r.error ?? 'erro'] }))
  }

  async function confirm(id: string) {
    setBusy(id); setMsg(null)
    const r = await reviewClassification(id, { action: 'confirm' })
    setBusy(null)
    if ('error' in r && r.error) setMsg(r.error)
  }

  async function correct(item: Item) {
    const stage = window.prompt(`Etapa do funil (${STAGES.join('/')}):`, item.funnel_stage)
    if (!stage || !STAGES.includes(stage as FunnelStage)) return
    const isSale = window.confirm('Marcar como VENDA? (OK = sim / Cancelar = não)')
    let value: number | null = null
    if (isSale) {
      const v = window.prompt('Valor da venda (R$):', String(item.sale_value_estimate ?? ''))
      value = v ? Number(v.replace(',', '.')) : null
    }
    setBusy(item.id); setMsg(null)
    const r = await reviewClassification(item.id, { action: 'correct', funnel_stage: stage as FunnelStage, is_sale: isSale, sale_value_estimate: value })
    setBusy(null)
    if ('error' in r && r.error) setMsg(r.error)
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma classificação pendente de revisão. 🎉</p>

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      {items.map(item => (
        <div key={item.id} className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {item.origem}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{item.funnel_stage}{item.is_sale ? ` · venda ${item.sale_value_estimate ? `R$ ${item.sale_value_estimate}` : ''}` : ''}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                confiança {(item.confidence_score * 100).toFixed(0)}%
                {item.first_message_at ? ` · 1ª msg ${new Date(item.first_message_at).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => showExcerpt(item.conversation_id)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Ver trecho</button>
              <button disabled={busy === item.id} onClick={() => confirm(item.id)} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">Confirmar IA</button>
              <button disabled={busy === item.id} onClick={() => correct(item)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">Corrigir</button>
            </div>
          </div>
          {excerpts[item.conversation_id] && (
            <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs text-foreground">
              {excerpts[item.conversation_id].join('\n')}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
