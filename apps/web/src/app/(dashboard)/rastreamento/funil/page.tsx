import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { formatBRL } from '@/lib/format'

export const dynamic = 'force-dynamic'

const STAGES = ['awareness', 'interest', 'consideration', 'intent', 'sale'] as const
const STAGE_LABEL: Record<string, string> = {
  awareness: 'Consciência', interest: 'Interesse', consideration: 'Consideração', intent: 'Intenção', sale: 'Venda',
}

/** Rastreamento → Funil — Story 5.5. */
export default async function FunilPage({
  searchParams,
}: { searchParams: Promise<{ periodo?: string; link?: string; revisao?: string }> }) {
  const { periodo = '30', link, revisao } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const svc = createSupabaseServiceClient()
  const { data: m } = await svc.from('workspace_members')
    .select('workspace_id').eq('user_id', user?.id ?? '').limit(1).maybeSingle()
  const ws = m?.workspace_id ?? ''

  // eslint-disable-next-line react-hooks/purity -- force-dynamic; "agora" é filtro
  const since = new Date(Date.now() - Number(periodo) * 86400_000).toISOString()

  const [{ data: settings }, { data: convs }, { data: links }] = await Promise.all([
    svc.from('workspace_settings').select('classification_confidence_threshold').eq('workspace_id', ws).maybeSingle(),
    svc.from('tracked_conversations').select('id, link_id, status, first_message_at')
      .eq('workspace_id', ws).gte('first_message_at', since),
    svc.from('tracking_links').select('id, code').eq('workspace_id', ws),
  ])
  const threshold = Number(settings?.classification_confidence_threshold ?? 0.7)
  const convList = (convs ?? []).filter(c => !link || c.link_id === link)
  const convIds = convList.map(c => c.id)
  const { data: cls } = convIds.length
    ? await svc.from('conversation_classifications')
        .select('conversation_id, funnel_stage, is_sale, sale_value_estimate, confidence_score, classified_at, reviewed_by')
        .in('conversation_id', convIds)
    : { data: [] }

  let classifications = cls ?? []
  if (revisao === 'revisadas') classifications = classifications.filter(c => c.reviewed_by)
  if (revisao === 'pendentes') classifications = classifications.filter(c => !c.reviewed_by && Number(c.confidence_score) < threshold)

  const byStage = new Map<string, number>(STAGES.map(s => [s, 0]))
  for (const c of classifications) byStage.set(c.funnel_stage, (byStage.get(c.funnel_stage) ?? 0) + 1)
  const total = classifications.length
  const sales = classifications.filter(c => c.is_sale)
  const pctSale = total ? Math.round((sales.length / total) * 100) : 0

  // AC 5.5.3: taxa de conversão por campanha/link
  const convToLink = new Map(convList.map(c => [c.id, c.link_id]))
  const linkCode = new Map((links ?? []).map(l => [l.id, l.code]))
  const byLink = new Map<string, { total: number; sales: number }>()
  for (const c of classifications) {
    const lid = convToLink.get(c.conversation_id) ?? 'sem-link'
    const e = byLink.get(lid) ?? { total: 0, sales: 0 }
    e.total++; if (c.is_sale) e.sales++
    byLink.set(lid, e)
  }

  // AC 5.5.5: cobertura tracked vs meta 70%
  const tracked = convList.filter(c => c.status === 'tracked').length
  const coverage = convList.length ? Math.round((tracked / convList.length) * 100) : 0
  const maxStage = Math.max(1, ...byStage.values())
  const inputClass = 'rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground'

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Rastreamento → Funil</h1>

      <form method="get" className="flex flex-wrap gap-3">
        <select name="periodo" defaultValue={periodo} className={inputClass}>
          <option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option>
        </select>
        <select name="link" defaultValue={link ?? ''} className={inputClass}>
          <option value="">Todas as origens</option>
          {(links ?? []).map(l => <option key={l.id} value={l.id}>/t/{l.code}</option>)}
        </select>
        <select name="revisao" defaultValue={revisao ?? ''} className={inputClass}>
          <option value="">Todas</option><option value="revisadas">Revisadas</option><option value="pendentes">Revisão pendente</option>
        </select>
        <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Filtrar</button>
      </form>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Classificadas</p><p className="text-lg font-semibold">{total}</p></div>
        <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Chegaram a venda</p><p className="text-lg font-semibold">{pctSale}%</p></div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Cobertura de origem (meta 70%)</p>
          <p className={`text-lg font-semibold ${coverage >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{coverage}%</p>
        </div>
      </div>

      {/* AC 5.5.1 — funil visual */}
      <div className="space-y-1">
        {STAGES.map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className="w-28 text-xs text-muted-foreground">{STAGE_LABEL[s]}</span>
            <div className="h-6 rounded bg-primary/80" style={{ width: `${Math.max(2, ((byStage.get(s) ?? 0) / maxStage) * 100)}%` }} />
            <span className="text-xs text-foreground">{byStage.get(s)}</span>
          </div>
        ))}
      </div>

      {/* AC 5.5.3 — conversão por origem */}
      {byLink.size > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Conversão por origem</h2>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {[...byLink.entries()].map(([lid, v]) => (
              <li key={lid} className="flex justify-between px-3 py-2">
                <span>{lid === 'sem-link' ? 'Origem não identificada' : `/t/${linkCode.get(lid) ?? '—'}`}</span>
                <span className="text-muted-foreground">{v.sales}/{v.total} vendas ({v.total ? Math.round((v.sales / v.total) * 100) : 0}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AC 5.5.4 / 5.5.6 — vendas */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Vendas classificadas</h2>
        {sales.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {sales.map(c => (
              <li key={c.conversation_id} className="flex justify-between px-3 py-2">
                <span>
                  {convToLink.get(c.conversation_id) ? `/t/${linkCode.get(convToLink.get(c.conversation_id)!) ?? '—'}` : 'Origem não identificada'}
                  {' · '}{c.sale_value_estimate ? formatBRL(Number(c.sale_value_estimate)) : 'sem valor'}
                  {!c.reviewed_by && Number(c.confidence_score) < threshold && <span title="revisão pendente"> ⚠️</span>}
                </span>
                <span className="text-muted-foreground">
                  {new Date(c.classified_at).toLocaleDateString('pt-BR')} · {(Number(c.confidence_score) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
