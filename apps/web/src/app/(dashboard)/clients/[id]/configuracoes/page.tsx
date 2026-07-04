import { notFound } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { WhatsAppConnectionList } from '@/components/molecules/WhatsAppConnectionList'
import { connectWhatsApp } from '@/app/actions/whatsapp'
import type { Client } from '@advezo/types'

async function getPageData(clientId: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createSupabaseServiceClient()

  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return null

  const [{ data: client }, { data: connections }] = await Promise.all([
    serviceClient
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .is('deleted_at', null)
      .single(),
    serviceClient
      .from('whatsapp_connections')
      .select('*, whatsapp_accounts(cb_paused_at, cb_failure_count)')
      .eq('client_id', clientId)
      .eq('workspace_id', membership.workspace_id)
      .order('created_at', { ascending: true }),
  ])

  if (!client) return null

  return {
    client: client as Client,
    workspaceId: membership.workspace_id,
    connections: connections ?? [],
  }
}

async function ConnectNewButton({ clientId, workspaceId }: { clientId: string; workspaceId: string }) {
  async function handleConnect(formData: FormData) {
    'use server'
    const accountId = String(formData.get('account_id') ?? '').trim().replace(/\D/g, '')
    if (!accountId) return
    await connectWhatsApp(clientId, accountId)
  }

  return (
    <form action={handleConnect} className="flex gap-2">
      <input
        type="text"
        name="account_id"
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
  )
}

export default async function ClientConfiguracoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getPageData(id)
  if (!data) notFound()

  const { client, workspaceId, connections } = data

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{client.name}</h1>
        <p className="text-sm text-muted-foreground">Configurações</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">WhatsApp</h2>

        <ConnectNewButton clientId={id} workspaceId={workspaceId} />

        <WhatsAppConnectionList
          clientId={id}
          workspaceId={workspaceId}
          connections={connections as Parameters<typeof WhatsAppConnectionList>[0]['connections']}
        />
      </section>
    </div>
  )
}
