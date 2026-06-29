import Link from 'next/link'
import { Plug } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { AdAccountCard } from '@/components/molecules/AdAccountCard'
import { SyncAccountButton } from '@/components/molecules/SyncAccountButton'
import { AlertList, type AlertListItem } from '@/components/molecules/AlertList'
import { EmptyState } from '@/components/molecules/EmptyState'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AdAccountDisplay } from '@advezo/types'

/**
 * Settings → Integrations  (Story 2.1 — AC 2.1.7 / 2.1.8; Story 2.9 — AC 2.9.4 / 2.9.5)
 *
 * Server Component. Lista as contas de anúncio conectadas SEM as colunas de token
 * criptografado (AC 2.1.2 / 2.1.5 — token nunca exposto em query de UI). Story 2.9:
 * carrega também os alertas ATIVOS (resolved_at IS NULL) por conta, exibindo o badge
 * no card (AdAccountCard) e a lista com ação "Marcar como resolvido" (AlertList).
 */

interface ActiveAlertRow {
  id: string
  ad_account_id: string
  alert_type: 'low_balance'
  projected_days: number
  created_at: string
}
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; platform?: string }>
}) {
  const { status, error, platform } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('ad_accounts')
    .select(
      'id, workspace_id, client_id, platform, external_account_id, account_name, token_type, status, error_message, last_synced_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })

  const accounts = (data ?? []) as AdAccountDisplay[]

  // Story 2.9: alertas ativos por conta (RLS já escopa por workspace).
  const { data: alertData } = await supabase
    .from('alerts')
    .select('id, ad_account_id, alert_type, projected_days, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })

  const activeAlerts = (alertData ?? []) as ActiveAlertRow[]
  const alertsByAccount = new Map<string, AlertListItem[]>()
  for (const alert of activeAlerts) {
    const list = alertsByAccount.get(alert.ad_account_id) ?? []
    list.push({
      id: alert.id,
      alert_type: alert.alert_type,
      projected_days: alert.projected_days,
      created_at: alert.created_at,
    })
    alertsByAccount.set(alert.ad_account_id, list)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/api/oauth/meta/start"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            Conectar Meta Ads
          </Link>
          <Link
            href="/api/oauth/google/start"
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
          >
            Conectar Google Ads
          </Link>
        </div>
      </div>

      {status === 'success' && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          {platform === 'google'
            ? 'Conta(s) Google Ads conectada(s) com sucesso.'
            : 'Conta(s) Meta Ads conectada(s) com sucesso.'}
        </div>
      )}

      {error === 'oauth_failed' && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível conectar a conta Meta Ads. Tente novamente.
        </div>
      )}

      {error === 'google_oauth_failed' && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível conectar a conta Google Ads. Tente novamente.
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Nenhuma conta conectada"
          subtitle="Conecte uma conta de Meta Ads para gerenciar suas campanhas no Advezo."
          action={{ label: 'Conectar Meta Ads', href: '/api/oauth/meta/start' }}
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const accountAlerts = alertsByAccount.get(account.id) ?? []
            return (
              <div key={account.id} className="space-y-2">
                <AdAccountCard
                  account={account}
                  hasActiveAlert={accountAlerts.length > 0}
                />
                {accountAlerts.length > 0 && <AlertList alerts={accountAlerts} />}
                {(account.platform === 'meta' || account.platform === 'google') && (
                  <SyncAccountButton
                    adAccountId={account.id}
                    platform={account.platform}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
