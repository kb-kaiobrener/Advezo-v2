'use client'

import { useState } from 'react'
import {
  saveReportSchedule,
  toggleReportSchedule,
  previewReport,
  type ReportSchedule,
  type ReportFrequency,
  type ReportDestinationType,
} from '@/app/actions/report-schedules'
import { ReportPreviewModal } from './ReportPreviewModal'

interface Props {
  clientId: string
  initialSchedule?: ReportSchedule | null
}

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
]

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

function defaultSendDay(frequency: ReportFrequency): number | null {
  if (frequency === 'weekly' || frequency === 'biweekly') return 1
  if (frequency === 'monthly') return 1
  return null
}

export function ReportScheduleForm({ clientId, initialSchedule }: Props) {
  const [frequency, setFrequency] = useState<ReportFrequency>(
    initialSchedule?.frequency ?? 'weekly'
  )
  const [sendDay, setSendDay] = useState<number | null>(
    initialSchedule?.send_day ?? defaultSendDay(initialSchedule?.frequency ?? 'weekly')
  )
  const [sendTime, setSendTime] = useState<string>(
    initialSchedule?.send_time?.slice(0, 5) ?? '09:00'
  )
  const [destinationType, setDestinationType] = useState<ReportDestinationType>(
    initialSchedule?.destination_type ?? 'individual'
  )
  const [destinationId, setDestinationId] = useState<string>(
    initialSchedule?.destination_id ?? ''
  )
  const [isActive, setIsActive] = useState<boolean>(initialSchedule?.is_active ?? true)

  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const showDayField = frequency === 'weekly' || frequency === 'biweekly' || frequency === 'monthly'
  const isWeekday = frequency === 'weekly' || frequency === 'biweekly'

  function handleFrequencyChange(value: ReportFrequency) {
    setFrequency(value)
    setSendDay(defaultSendDay(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSaving(true)

    const result = await saveReportSchedule(clientId, {
      frequency,
      send_day: showDayField ? sendDay : null,
      send_time: sendTime,
      destination_type: destinationType,
      destination_id: destinationId,
    })

    setSaving(false)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Configuração salva com sucesso.' })
    }
  }

  async function handleToggle() {
    if (!initialSchedule) return
    setToggling(true)
    const next = !isActive
    const result = await toggleReportSchedule(initialSchedule.id, clientId, next)
    setToggling(false)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setIsActive(next)
    }
  }

  async function handlePreview() {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewText(null)
    setPreviewError(null)

    const result = await previewReport(clientId)

    setPreviewLoading(false)
    if (result.error) {
      setPreviewError(result.error)
    } else {
      setPreviewText(result.text ?? '')
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!initialSchedule && (
          <p className="text-sm text-muted-foreground">
            Não configurado — preencha os campos abaixo e salve para ativar o envio automático.
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="frequency" className="text-sm font-medium text-foreground">
            Frequência
          </label>
          <select
            id="frequency"
            value={frequency}
            onChange={e => handleFrequencyChange(e.target.value as ReportFrequency)}
            className={inputClass}
          >
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
          </select>
        </div>

        {showDayField && isWeekday && (
          <div className="space-y-1">
            <label htmlFor="send_day_week" className="text-sm font-medium text-foreground">
              Dia da semana
            </label>
            <select
              id="send_day_week"
              value={sendDay ?? 1}
              onChange={e => setSendDay(Number(e.target.value))}
              className={inputClass}
            >
              {WEEKDAYS.map(d => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showDayField && !isWeekday && (
          <div className="space-y-1">
            <label htmlFor="send_day_month" className="text-sm font-medium text-foreground">
              Dia do mês
            </label>
            <input
              id="send_day_month"
              type="number"
              min={1}
              max={28}
              value={sendDay ?? 1}
              onChange={e => setSendDay(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="send_time" className="text-sm font-medium text-foreground">
            Hora do envio
          </label>
          <input
            id="send_time"
            type="time"
            value={sendTime}
            onChange={e => setSendTime(e.target.value)}
            className={inputClass}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Tipo de destinatário</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="destination_type"
                value="individual"
                checked={destinationType === 'individual'}
                onChange={() => setDestinationType('individual')}
              />
              Número individual
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="destination_type"
                value="group"
                checked={destinationType === 'group'}
                onChange={() => setDestinationType('group')}
              />
              Grupo de WhatsApp
            </label>
          </div>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="destination_id" className="text-sm font-medium text-foreground">
            {destinationType === 'individual' ? 'Número do destinatário' : 'ID do grupo'}
          </label>
          <input
            id="destination_id"
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
              message.type === 'success'
                ? 'text-sm text-emerald-600'
                : 'text-sm text-destructive'
            }
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>

          <button
            type="button"
            onClick={handlePreview}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Pré-visualizar relatório
          </button>

          {initialSchedule && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isActive}
                disabled={toggling}
                onChange={handleToggle}
              />
              Ativo
            </label>
          )}
        </div>
      </form>

      {previewOpen && (
        <ReportPreviewModal
          loading={previewLoading}
          text={previewText}
          error={previewError}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  )
}
