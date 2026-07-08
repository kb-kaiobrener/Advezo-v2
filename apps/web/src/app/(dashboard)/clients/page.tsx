import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { createSupabaseServerClient } from '@advezo/database'
import { ClientCard } from '@/components/molecules/ClientCard'
import { EmptyState } from '@/components/molecules/EmptyState'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Client } from '@advezo/types'

const PAGE_SIZE = 20

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>
}) {
  const { after } = await searchParams
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('clients')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (after) {
    query = query.lt('created_at', after)
  }

  const { data, error } = await query

  // Fix TD-006: erro de query não pode virar lista vazia silenciosa — um 403
  // de grant/RLS escondia os clientes do gestor como se fosse estado normal.
  if (error) {
    console.error('[clients/page] erro ao listar clientes:', error.message)
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground">Clientes</h1>
        <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar seus clientes. Recarregue a página — se o
          problema persistir, contate o suporte.
        </p>
      </div>
    )
  }

  const clients = (data ?? []) as Client[]
  const hasMore = clients.length > PAGE_SIZE
  const visible = hasMore ? clients.slice(0, PAGE_SIZE) : clients
  const nextCursor = hasMore ? visible[visible.length - 1].created_at : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Clientes</h1>
        <Link href="/clients/new" className={cn(buttonVariants({ size: 'sm' }))}>
          <Plus className="mr-1.5 size-4" />
          Novo Cliente
        </Link>
      </div>

      {visible.length === 0 && !after ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado"
          subtitle="Adicione seu primeiro cliente para começar"
          action={{ label: 'Adicionar Cliente', href: '/clients/new' }}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}

          {hasMore && nextCursor && (
            <div className="pt-4 text-center">
              <Link
                href={`/clients?after=${encodeURIComponent(nextCursor)}`}
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                Carregar mais
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
