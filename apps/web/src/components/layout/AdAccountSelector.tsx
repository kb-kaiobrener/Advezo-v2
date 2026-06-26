'use client'

import { useQuery } from '@tanstack/react-query'
import { useActiveClientStore } from '@/stores/useActiveClientStore'
import { useActiveAdAccountStore } from '@/stores/useActiveAdAccountStore'
import { fetchAdAccounts } from '@/lib/queries/ad-accounts'
import { cn } from '@/lib/utils'

export function AdAccountSelector() {
  const activeClientId = useActiveClientStore((s) => s.activeClientId)
  const activeAdAccountId = useActiveAdAccountStore((s) => s.activeAdAccountId)
  const setActiveAdAccount = useActiveAdAccountStore(
    (s) => s.setActiveAdAccount
  )

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['ad-accounts', activeClientId],
    queryFn: () => fetchAdAccounts(activeClientId as string),
    enabled: activeClientId !== null,
  })

  if (!activeClientId) return null

  if (isLoading) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">Carregando...</p>
    )
  }

  if (accounts.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        Nenhuma conta conectada
      </p>
    )
  }

  return (
    <ul role="listbox" aria-label="Contas de anúncios" className="space-y-0.5">
      {accounts.map((account) => {
        const isSelected = account.id === activeAdAccountId
        return (
          <li
            key={account.id}
            role="option"
            aria-selected={isSelected}
            onClick={() =>
              setActiveAdAccount(account.id, account.name, account.platform)
            }
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-sm hover:bg-muted',
              isSelected && 'bg-brand-100 text-brand-700'
            )}
          >
            {account.name}
          </li>
        )
      })}
    </ul>
  )
}
