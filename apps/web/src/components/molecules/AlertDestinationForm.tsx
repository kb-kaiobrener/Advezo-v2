'use client'

import { useState } from 'react'
import {
  saveAlertDestination,
  type AlertDestinationType,
} from '@/app/actions/alert-destination'

interface Props {
  clientId: string
  accountId: string | null // uuid de whatsapp_accounts; null = nenhuma conta
  initialType: AlertDestinationType | null
  initialDestination: string | null
}

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

export function AlertDestinationForm({
  clientId,
  accountId,
  initialType,
  initialDestination,
}: Props) {
  const [destinationType, setDestinationType] = useState<AlertDestinationType>(
    initialType ?? 'individual'
  )
  const [destinationId, setDestinationId] = useState<string>(initialDestination ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!accountId) {
    return (
      <p className="text-sm text-muted-foreground">
        Conecte uma conta de WhatsApp para configurar o destino de alertas.
      </p>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSaving(true)

    const result = await saveAlertDestination(accountId!, clientId, {
      destination_type: destinationType,
      destination_id: destinationId,
    })

    setSaving(false)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Destino de alertas salvo com sucesso.' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Alertas de saldo baixo serão enviados para este destino — independente do
        destinatário de relatórios.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Tipo de destinatário</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="alert_destination_type"
              value="individual"
              checked={destinationType === 'individual'}
              onChange={() => setDestinationType('individual')}
            />
            Número individual
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="alert_destination_type"
              value="group"
              checked={destinationType === 'group'}
              onChange={() => setDestinationType('group')}
            />
            Grupo de WhatsApp
          </label>
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="alert_destination_id" className="text-sm font-medium text-foreground">
          {destinationType === 'individual' ? 'Número do destinatário' : 'ID do grupo'}
        </label>
        <input
          id="alert_destination_id"
          type="text"
          value={destinationId}
          onChange={e => setDestinationId(e.target.value)}
          placeholder={
            destinationType === 'individual' ? 'Ex: 5511999998888' : 'Ex: 120363XXXXX@g.us'
          }
          className={inputClass}
        />
      </div>

      {message && (
        <p
          className={
            message.type === 'success' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'
          }
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? 'Salvando...' : 'Salvar destino de alertas'}
      </button>
    </form>
  )
}
