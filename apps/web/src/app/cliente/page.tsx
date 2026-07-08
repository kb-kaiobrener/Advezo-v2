import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { ClientePanel } from '@/components/molecules/ClientePanel'

/**
 * Painel do cliente final (Story 3.8, AC 3.8.4/3.8.5) — 100% visualização.
 * O middleware já garante sessão + claim; aqui carregamos o nome do cliente
 * via RLS client_read e o painel busca as métricas em /api/cliente/metrics.
 */
export default async function ClientePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/cliente/login')

  // Fix BLOCK-003: claim do JWT verificado (getClaims), não do user_metadata do banco
  const { data: claimsData } = await supabase.auth.getClaims()
  const clientId = claimsData?.claims?.user_metadata?.client_id as string | undefined
  if (!clientId) redirect('/cliente/login')

  // RLS client_read: o cliente só enxerga a própria linha
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{client?.name ?? 'Meu painel'}</h1>
          <p className="text-sm text-muted-foreground">Resultados das suas campanhas</p>
        </div>
        <form action="/cliente/sair" method="post">
          <SairButton />
        </form>
      </div>

      <ClientePanel clientId={clientId} />
    </div>
  )
}

function SairButton() {
  return (
    <button
      type="submit"
      className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
    >
      Sair
    </button>
  )
}
