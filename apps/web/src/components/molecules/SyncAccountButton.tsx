'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncMetaAccountNow, syncGoogleAccountNow } from '@/app/actions/sync'

/**
 * SyncAccountButton (Story 2.4 — AC 2.4.5)
 *
 * Botão genérico "Sincronizar agora" por conta. Reutiliza a mesma UI de loading/erro
 * do Meta (Story 2.3) e apenas seleciona qual Server Action chamar conforme a
 * plataforma — evita duplicar o componente por plataforma.
 */

const SYNC_ACTIONS = {
  meta: syncMetaAccountNow,
  google: syncGoogleAccountNow,
} as const

interface SyncAccountButtonProps {
  adAccountId: string
  platform: keyof typeof SYNC_ACTIONS
}

export function SyncAccountButton({ adAccountId, platform }: SyncAccountButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSync() {
    setError(null)
    startTransition(async () => {
      const action = SYNC_ACTIONS[platform]
      const result = await action(adAccountId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleSync}
      >
        <RefreshCw className={isPending ? 'animate-spin' : undefined} />
        {isPending ? 'Sincronizando…' : 'Sincronizar agora'}
      </Button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
