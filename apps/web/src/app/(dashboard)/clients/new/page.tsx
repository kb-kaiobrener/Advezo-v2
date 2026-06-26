import { ClientForm } from '@/components/molecules/ClientForm'
import { createClient } from '@/app/actions/clients'

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-foreground">
        Novo Cliente
      </h1>
      <ClientForm onSubmit={createClient} submitLabel="Criar Cliente" />
    </div>
  )
}
