'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { disconnectWhatsApp, resetCircuitBreaker, saveNoticeTemplate } from '@/app/actions/whatsapp'
import { QrPollingDialog } from './QrPollingDialog'

export interface WhatsAppConnection {
  id: string
  account_id: string
  status: 'disconnected' | 'connecting' | 'connected'
  connected_at: string | null
  notice_template: string | null
  whatsapp_accounts: {
    cb_paused_at: string | null
    cb_failure_count: number
  } | null
}

interface ConnectionStatusBadgeProps {
  conn: WhatsAppConnection
}

function ConnectionStatusBadge({ conn }: ConnectionStatusBadgeProps) {
  const cbOpen = conn.whatsapp_accounts?.cb_paused_at != null

  if (cbOpen) {
    return (
      <span
        title="Muitas falhas de reconexão — número pausado temporariamente"
        className="inline-flex items-center gap-1 rounded-sm bg-red-950/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
      >
        ⚠️ Pausado
      </span>
    )
  }

  const config = {
    connected:    { icon: '✅', label: 'Conectado',       cls: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
    connecting:   { icon: '⏳', label: 'Aguardando QR',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400' },
    disconnected: { icon: '❌', label: 'Desconectado',    cls: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
  }[conn.status]

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium', config.cls)}>
      {config.icon} {config.label}
    </span>
  )
}

interface Props {
  clientId: string
  workspaceId: string
  connections: WhatsAppConnection[]
}

export function WhatsAppConnectionList({ clientId, workspaceId, connections }: Props) {
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [templateValues, setTemplateValues] = useState<Record<string, string>>(
    Object.fromEntries(connections.map(c => [c.account_id, c.notice_template ?? '']))
  )
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null)

  function handleDisconnect(accountId: string) {
    startTransition(async () => {
      await disconnectWhatsApp(clientId, accountId)
    })
  }

  function handleResetCb(accountId: string) {
    startTransition(async () => {
      await resetCircuitBreaker(accountId)
    })
  }

  async function handleSaveTemplate(accountId: string) {
    setSavingTemplate(accountId)
    await saveNoticeTemplate(clientId, accountId, templateValues[accountId] ?? '')
    setSavingTemplate(null)
  }

  return (
    <div className="space-y-4">
      {connections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum número conectado. Clique em &quot;Conectar WhatsApp&quot; para começar.
        </p>
      )}

      {connections.map(conn => (
        <div
          key={conn.id}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-sm font-medium text-card-foreground truncate">
                +{conn.account_id}
              </span>
              <ConnectionStatusBadge conn={conn} />
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {conn.whatsapp_accounts?.cb_paused_at && (
                <button
                  onClick={() => handleResetCb(conn.account_id)}
                  disabled={isPending}
                  className="rounded px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                >
                  Resetar
                </button>
              )}

              {conn.status === 'disconnected' && !conn.whatsapp_accounts?.cb_paused_at && (
                <button
                  onClick={() => setConnectingAccountId(conn.account_id)}
                  className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                >
                  Reconectar
                </button>
              )}

              {conn.status === 'connected' && (
                <button
                  onClick={() => handleDisconnect(conn.account_id)}
                  disabled={isPending}
                  className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Template de aviso ao titular
            </label>
            <div className="flex gap-2">
              <textarea
                value={templateValues[conn.account_id] ?? ''}
                onChange={e => setTemplateValues(prev => ({ ...prev, [conn.account_id]: e.target.value }))}
                placeholder="Mensagem enviada ao lead no primeiro contato rastreado (opcional)"
                rows={2}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => handleSaveTemplate(conn.account_id)}
                disabled={savingTemplate === conn.account_id}
                className="self-end rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {savingTemplate === conn.account_id ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ))}

      {connectingAccountId && (
        <QrPollingDialog
          clientId={clientId}
          accountId={connectingAccountId}
          workspaceId={workspaceId}
          onClose={() => setConnectingAccountId(null)}
        />
      )}
    </div>
  )
}
