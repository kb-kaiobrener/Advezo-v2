import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { ReviewList } from '@/components/molecules/ReviewList'

export const dynamic = 'force-dynamic'

/** Rastreamento → Revisão — Story 5.4 (fila de baixa confiança). */
export default async function RevisaoPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const svc = createSupabaseServiceClient()
  const { data: m } = await svc.from('workspace_members')
    .select('workspace_id').eq('user_id', user?.id ?? '').limit(1).maybeSingle()
  const ws = m?.workspace_id ?? ''

  const [{ data: settings }, { data: pend, error }] = await Promise.all([
    svc.from('workspace_settings').select('classification_confidence_threshold').eq('workspace_id', ws).maybeSingle(),
    svc.from('conversation_classifications')
      .select('id, conversation_id, funnel_stage, is_sale, sale_value_estimate, confidence_score, classified_at')
      .eq('workspace_id', ws).is('reviewed_by', null),
  ])
  const threshold = Number(settings?.classification_confidence_threshold ?? 0.7)
  // needs_review (AC 5.4.1): abaixo do limiar e sem revisão
  const items = (pend ?? []).filter(p => Number(p.confidence_score) < threshold)

  // origem (link) das conversas
  const convIds = items.map(i => i.conversation_id)
  const { data: convs } = convIds.length
    ? await svc.from('tracked_conversations').select('id, link_id, first_message_at').in('id', convIds)
    : { data: [] }
  const { data: links } = await svc.from('tracking_links').select('id, code').eq('workspace_id', ws)
  const linkCode = new Map((links ?? []).map(l => [l.id, l.code]))
  const convMap = new Map((convs ?? []).map(c => [c.id, c]))

  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-8"><p className="rounded-md bg-red-50 p-4 text-sm text-red-700">Erro ao carregar revisões.</p></div>
  }

  const enriched = items.map(i => {
    const c = convMap.get(i.conversation_id)
    return {
      ...i,
      confidence_score: Number(i.confidence_score),
      sale_value_estimate: i.sale_value_estimate === null ? null : Number(i.sale_value_estimate),
      origem: c?.link_id ? `/t/${linkCode.get(c.link_id) ?? '—'}` : 'Origem não identificada',
      first_message_at: c?.first_message_at ?? null,
    }
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">
        Rastreamento → Revisão
        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-700">{enriched.length} pendentes</span>
      </h1>
      <p className="text-xs text-muted-foreground">
        Classificações com confiança abaixo de {threshold.toFixed(2)}. Conversões ao Meta Ads
        NUNCA são disparadas automaticamente para itens desta fila sem revisão (NFR-6).
      </p>
      <ReviewList items={enriched} />
    </div>
  )
}
