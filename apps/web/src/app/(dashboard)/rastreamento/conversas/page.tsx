import Link from 'next/link'
import { createSupabaseServerClient } from '@advezo/database'

export const dynamic = 'force-dynamic' // AC 4.5.5: dados frescos a cada visita

/** Dashboard de origem de conversas — Story 4.5. Filtros via GET (server-rendered). */
export default async function ConversasRastreadasPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; periodo?: string; link?: string; status?: string }>
}) {
  const { cliente, periodo = '30', link, status } = await searchParams
  const supabase = await createSupabaseServerClient()

  const [{ data: clients }, { data: links, error: linksError }] = await Promise.all([
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('tracking_links').select('id, code, active, client_id').order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line react-hooks/purity -- página force-dynamic; "agora" é parte do filtro (mesmo padrão do dashboard/page)
  const since = new Date(Date.now() - Number(periodo) * 86400_000).toISOString()
  let query = supabase
    .from('tracked_conversations')
    .select('id, client_id, link_id, first_message_at, status')
    .gte('first_message_at', since)
    .order('first_message_at', { ascending: false })
    .limit(200)
  if (cliente) query = query.eq('client_id', cliente)
  if (link) query = query.eq('link_id', link)
  if (status === 'tracked' || status === 'untracked') query = query.eq('status', status)
  const { data: convs, error } = await query

  if (error || linksError) {
    console.error('[conversas] erro:', error?.message ?? linksError?.message)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground">Conversas rastreadas</h1>
        <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar as conversas. Recarregue a página.
        </p>
      </div>
    )
  }

  const rows = convs ?? []
  const total = rows.length
  const tracked = rows.filter(r => r.status === 'tracked').length
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0
  const linkCode = new Map((links ?? []).map(l => [l.id, l.code]))
  const clientName = new Map((clients ?? []).map(c => [c.id, c.name]))
  const hasActiveLinks = (links ?? []).some(l => l.active)
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR')
  const inputClass = 'rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground'

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Rastreamento → Conversas</h1>

      {/* AC 4.5.6 — empty state com CTA quando não há links ativos */}
      {!hasActiveLinks && total === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Nenhum link rastreável ativo — as conversas só são rastreadas a partir de cliques em links.
          </p>
          <Link href="/rastreamento" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Criar primeiro link rastreável
          </Link>
        </div>
      ) : (
        <>
          {/* AC 4.5.2 — filtros (GET form, server-rendered) */}
          <form method="get" className="flex flex-wrap items-end gap-3">
            <select name="cliente" defaultValue={cliente ?? ''} className={inputClass}>
              <option value="">Todos os clientes</option>
              {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="periodo" defaultValue={periodo} className={inputClass}>
              <option value="7">7 dias</option><option value="14">14 dias</option>
              <option value="30">30 dias</option><option value="90">90 dias</option>
            </select>
            <select name="link" defaultValue={link ?? ''} className={inputClass}>
              <option value="">Todas as origens</option>
              {(links ?? []).map(l => <option key={l.id} value={l.id}>/t/{l.code}</option>)}
            </select>
            <select name="status" defaultValue={status ?? ''} className={inputClass}>
              <option value="">Todos os status</option>
              <option value="tracked">Rastreadas</option>
              <option value="untracked">Origem não identificada</option>
            </select>
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              Filtrar
            </button>
          </form>

          {/* AC 4.5.3 — resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Conversas no período</p>
              <p className="text-lg font-semibold text-foreground">{total}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Rastreadas</p>
              <p className="text-lg font-semibold text-foreground">{tracked} ({pct}%)</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Não identificadas</p>
              <p className="text-lg font-semibold text-foreground">{total - tracked} ({total > 0 ? 100 - pct : 0}%)</p>
            </div>
          </div>

          {/* AC 4.5.1 / 4.5.4 — lista */}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conversa no período/filtros selecionados.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {rows.map(r => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-foreground">
                      {r.status === 'tracked'
                        ? <>Origem: <span className="font-medium">/t/{linkCode.get(r.link_id ?? '') ?? '—'}</span></>
                        : <span className="text-muted-foreground">Origem não identificada</span>}
                      <span className="ml-2 text-xs text-muted-foreground">{clientName.get(r.client_id) ?? '—'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">1ª mensagem: {fmt(r.first_message_at)}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'tracked' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {r.status === 'tracked' ? 'Rastreada' : 'Não identificada'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
