'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { AdAccountDisplay, AdAccountStatus } from '@advezo/types'
import { PlatformIcon } from '@/components/atoms/PlatformIcon'
import { cn } from '@/lib/utils'

/**
 * AdAccountCard (Story 2.1 — AC 2.1.7 / 2.1.8; Story 2.9 — AC 2.9.4)
 *
 * Renderiza uma conta de anúncio conectada. Recebe AdAccountDisplay (sem colunas
 * de token). Mostra badge de plataforma, badge de status, e — quando expirado ou
 * em erro — um aviso inline com ação de reconexão / mensagem de erro.
 *
 * Story 2.9: quando a conta tem alerta ativo (hasActiveAlert), exibe um badge de
 * alerta de saldo no header. O badge some quando o alerta é resolvido (o pai deixa
 * de passar hasActiveAlert), pois a lista de alertas ativos é refeita pela página.
 */

const statusConfig: Record<AdAccountStatus, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-green-100 text-green-700' },
  expired: { label: 'Expirada', className: 'bg-yellow-100 text-yellow-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
}

const platformLabel: Record<AdAccountDisplay['platform'], string> = {
  meta: 'Meta',
  google: 'Google',
}

const platformBadgeClass: Record<AdAccountDisplay['platform'], string> = {
  meta: 'bg-blue-100 text-blue-700',
  google: 'bg-red-100 text-red-700',
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Cada plataforma reconecta pelo seu próprio fluxo OAuth (Story 2.2 adiciona Google).
const reconnectHref: Record<AdAccountDisplay['platform'], string> = {
  meta: '/api/oauth/meta/start',
  google: '/api/oauth/google/start',
}

interface AdAccountCardProps {
  account: AdAccountDisplay
  /** Story 2.9 — AC 2.9.4: exibe o badge de alerta de saldo quando true. */
  hasActiveAlert?: boolean
}

export function AdAccountCard({ account, hasActiveAlert = false }: AdAccountCardProps) {
  const status = statusConfig[account.status]
  const lastSynced = formatDate(account.last_synced_at)
  const reconnectUrl = reconnectHref[account.platform]

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <PlatformIcon platform={account.platform} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-card-foreground">
            {account.account_name ?? 'Conta sem nome'}
          </p>
          {lastSynced && (
            <p className="truncate text-xs text-muted-foreground">
              Última sincronização: {lastSynced}
            </p>
          )}
        </div>

        {hasActiveAlert && (
          <span
            className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            aria-label="Alerta de saldo"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Saldo baixo
          </span>
        )}

        <span
          className={cn(
            'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
            platformBadgeClass[account.platform]
          )}
        >
          {platformLabel[account.platform]}
        </span>

        <span
          className={cn(
            'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
            status.className
          )}
        >
          {status.label}
        </span>
      </div>

      {account.status === 'expired' && (
        <div className="flex items-center justify-between rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          <span>Token expirado</span>
          {reconnectUrl && (
            <Link href={reconnectUrl} className="font-medium underline hover:no-underline">
              Reconectar
            </Link>
          )}
        </div>
      )}

      {account.status === 'error' && account.error_message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {account.error_message}
        </p>
      )}
    </div>
  )
}
