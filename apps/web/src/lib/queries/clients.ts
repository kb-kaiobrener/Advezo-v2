import type { Client } from '@advezo/types'

export type ClientListItem = Pick<Client, 'id' | 'name' | 'contact_email'>

export async function fetchClients(): Promise<ClientListItem[]> {
  const res = await fetch('/api/clients')
  if (!res.ok) throw new Error('Failed to fetch clients')
  return res.json()
}
