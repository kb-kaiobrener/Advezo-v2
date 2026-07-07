'use client'

import { useState } from 'react'
import { inviteClientUser, type ClientUser } from '@/app/actions/client-users'

interface Props {
  clientId: string
  existingUsers: ClientUser[]
}

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

export function ClientAccessForm({ clientId, existingUsers }: Props) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSending(true)
    const result = await inviteClientUser(clientId, email)
    setSending(false)
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Convite enviado — o cliente recebe um email para definir a senha.' })
      setEmail('')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O cliente acessa um painel próprio somente-leitura em /cliente, com os dados
        exclusivamente das contas dele.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1">
          <label htmlFor="client_user_email" className="text-sm font-medium text-foreground">
            Email do cliente
          </label>
          <input
            id="client_user_email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="cliente@empresa.com"
            required
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {sending ? 'Enviando...' : 'Enviar convite'}
        </button>
      </form>

      {message && (
        <p
          className={
            message.type === 'success' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'
          }
        >
          {message.text}
        </p>
      )}

      {existingUsers.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {existingUsers.map(u => (
            <li key={u.id} className="flex items-center justify-between px-4 py-2">
              <span className="text-sm text-foreground">{u.email}</span>
              <span className="text-xs text-muted-foreground">
                {u.accepted_at ? 'Ativo' : 'Convite pendente'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
