import type { AdAccount } from '@advezo/types'

export type AdAccountListItem = Pick<
  AdAccount,
  'id' | 'name' | 'platform' | 'status'
>

export async function fetchAdAccounts(
  clientId: string
): Promise<AdAccountListItem[]> {
  const res = await fetch(
    `/api/ad-accounts?clientId=${encodeURIComponent(clientId)}`
  )
  if (!res.ok) throw new Error('Failed to fetch ad accounts')
  return res.json()
}
