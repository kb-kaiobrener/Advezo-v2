import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { ClientForm } from '@/components/molecules/ClientForm'
import { updateClient } from '@/app/actions/clients'
import type { Client } from '@advezo/types'

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!data) notFound()

  const client = data as Client

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-foreground">
        Editar Cliente
      </h1>
      <ClientForm
        defaultValues={{
          name: client.name,
          document: client.document ?? '',
          contact_email: client.contact_email ?? '',
          contact_phone: client.contact_phone ?? '',
        }}
        // Server Action VINCULADA (.bind) — closures comuns não são serializáveis
        // de Server → Client Component (bug pré-existente da Story 1.5, mascarado
        // pelo notFound() do TD-006 que interrompia a render antes do form)
        onSubmit={updateClient.bind(null, id)}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
