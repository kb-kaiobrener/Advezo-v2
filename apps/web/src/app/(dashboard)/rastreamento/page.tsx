import { createSupabaseServerClient } from '@advezo/database'
import { TrackingLinksManager } from '@/components/molecules/TrackingLinksManager'
import type { TrackingLink } from '@/app/actions/tracking-links'

export default async function RastreamentoPage() {
  const supabase = await createSupabaseServerClient()

  const [{ data: clients, error: clientsError }, { data: links, error: linksError }] =
    await Promise.all([
      supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('tracking_links').select('*').order('created_at', { ascending: false }),
    ])

  // padrão pós-TD-006: erro nunca vira estado vazio silencioso
  if (clientsError || linksError) {
    console.error('[rastreamento] erro:', clientsError?.message ?? linksError?.message)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground">Rastreamento</h1>
        <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os links. Recarregue a página.
        </p>
      </div>
    )
  }

  // contagem de cliques por link (session client; RLS via subquery de tracking_links)
  const linkIds = (links ?? []).map(l => l.id)
  const clickCounts = new Map<string, number>()
  if (linkIds.length) {
    const { data: clicks } = await supabase
      .from('tracked_clicks').select('link_id').in('link_id', linkIds)
    for (const c of clicks ?? []) clickCounts.set(c.link_id, (clickCounts.get(c.link_id) ?? 0) + 1)
  }

  const clientName = new Map((clients ?? []).map(c => [c.id, c.name]))
  const enriched = ((links ?? []) as TrackingLink[]).map(l => ({
    ...l,
    click_count: clickCounts.get(l.id) ?? 0,
    client_name: clientName.get(l.client_id) ?? '—',
  }))

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Rastreamento → Links</h1>
        <a href="/rastreamento/conversas" className="text-sm text-primary hover:underline">
          Ver conversas rastreadas →
        </a>
      </div>
      <TrackingLinksManager clients={clients ?? []} links={enriched} baseUrl={baseUrl} />
    </div>
  )
}
