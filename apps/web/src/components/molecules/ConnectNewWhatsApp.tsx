'use client'

import { useState } from 'react'
import { QrPollingDialog } from './QrPollingDialog'

interface Props {
  clientId: string
  workspaceId: string
}

export function ConnectNewWhatsApp({ clientId, workspaceId }: Props) {
  const [input, setInput] = useState('')
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const accountId = input.replace(/\D/g, '').trim()
    if (!accountId) return
    setActiveAccountId(accountId)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ex: 5511999998888"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Conectar WhatsApp
        </button>
      </form>

      {activeAccountId && (
        <QrPollingDialog
          clientId={clientId}
          accountId={activeAccountId}
          workspaceId={workspaceId}
          onClose={() => {
            setActiveAccountId(null)
            setInput('')
          }}
        />
      )}
    </>
  )
}
