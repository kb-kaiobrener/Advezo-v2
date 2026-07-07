'use client'

import { useState } from 'react'
import { resendReport, sendNow, type ReportLog } from '@/app/actions/report-send'

interface Props {
  clientId: string
  scheduleId: string | null
  logs: ReportLog[]
}

const STATUS_BADGE: Record<ReportLog['status'], { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-700' },
  pending: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

export function ReportSendHistory({ clientId, scheduleId, logs }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sendingNow, setSendingNow] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleResend(logId: string) {
    setMessage(null)
    setBusyId(logId)
    const result = await resendReport(logId, clientId)
    setBusyId(null)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Relatório reenviado com sucesso.' })
    }
  }

  async function handleSendNow() {
    if (!scheduleId) return
    setMessage(null)
    setSendingNow(true)
    const result = await sendNow(scheduleId, clientId)
    setSendingNow(false)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Relatório enviado com sucesso.' })
    }
  }

  return (
    <div className="space-y-4">
      {scheduleId && (
        <button
          type="button"
          onClick={handleSendNow}
          disabled={sendingNow}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {sendingNow ? 'Enviando...' : 'Enviar Agora'}
        </button>
      )}

      {message && (
        <p
          className={
            message.type === 'success' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'
          }
        >
          {message.text}
        </p>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {logs.map(log => {
            const badge = STATUS_BADGE[log.status]
            return (
              <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-sm text-foreground">
                    Período: {formatDate(log.period_start)}
                  </span>
                  {log.status === 'failed' && log.error_message && (
                    <span className="text-xs text-muted-foreground" title={log.error_message}>
                      {log.error_message.slice(0, 60)}
                    </span>
                  )}
                </div>
                {log.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => handleResend(log.id)}
                    disabled={busyId === log.id}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {busyId === log.id ? 'Reenviando...' : 'Reenviar'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
