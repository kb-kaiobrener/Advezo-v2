'use client'

import { useState, useTransition } from 'react'
import {
  pauseCampaign,
  activateCampaign,
  updateCampaignBudget,
} from '@/app/actions/campaigns'

/**
 * Ações inline de campanha (Story 2.7 — AC 2.7.1 / 2.7.5).
 *
 * Client Component: pausa/ativa e ajusta o orçamento diário chamando Server Actions.
 * CP3 (sem estado otimista): o estado de campanha (status, orçamento) só muda na UI
 * após revalidatePath confirmar o banco. useTransition apenas desabilita os controles
 * durante o submit (estado de formulário, não otimista). Erros da plataforma são
 * exibidos inline (AC 2.7.3 / 2.7.5).
 *
 * Só recebe o adCampaignId (UUID interno) — a Server Action busca o external_campaign_id
 * e o token a partir do banco pelo UUID. Nenhum dado sensível trafega pela prop.
 */

interface CampaignActionsProps {
  campaignId: string // ad_campaigns.id (UUID)
  status: string
  currentBudget: number | null
}

const buttonClass =
  'rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'

const primaryButtonClass =
  'rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed'

const inputClass =
  'w-28 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600'

export function CampaignActions({
  campaignId,
  status,
  currentBudget,
}: CampaignActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [budgetValue, setBudgetValue] = useState(currentBudget?.toString() ?? '')

  // Só pausa/ativa campanhas active/paused — deleted/archived não têm ação.
  const canToggle = status === 'active' || status === 'paused'
  if (!canToggle) return null

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const fn = status === 'active' ? pauseCampaign : activateCampaign
      const result = await fn(campaignId)
      if (result.error) setError(result.error)
    })
  }

  function handleBudgetSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const newBudget = parseFloat(budgetValue)
    if (isNaN(newBudget) || newBudget <= 0) {
      setError('Valor inválido')
      return
    }
    startTransition(async () => {
      const result = await updateCampaignBudget(campaignId, newBudget)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={buttonClass}
      >
        {isPending ? '...' : status === 'active' ? 'Pausar' : 'Ativar'}
      </button>

      <form onSubmit={handleBudgetSubmit} className="flex items-center gap-2">
        <input
          type="number"
          value={budgetValue}
          onChange={(e) => setBudgetValue(e.target.value)}
          step="0.01"
          min="0.01"
          disabled={isPending}
          className={inputClass}
          placeholder="Orçamento (R$)"
          aria-label="Novo orçamento diário em reais"
        />
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          Salvar
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
