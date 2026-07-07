import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'
import type { MetricTotals } from '@/lib/dashboard/metrics'

export const dynamic = 'force-dynamic'

const VALID_PERIODS = [7, 14, 30] as const
type Period = (typeof VALID_PERIODS)[number]

export interface ClienteAccountMetrics {
  account_id: string
  account_name: string | null
  platform: string
  totals: MetricTotals
  health: 'green' | 'yellow' | 'red'
}

/**
 * GET /api/cliente/metrics?client_id=X&period=7|14|30 — Story 3.8 (AC 3.8.2 / 3.8.4).
 *
 * ORDEM DOS GUARDS (não reordenar):
 *   1. Sem sessão → 401
 *   2. Sessão sem claim client_id (não é cliente) → 403
 *   3. client_id solicitado ≠ claim do JWT → 403  ← TESTE EXPLÍCITO DO AC 3.8.2
 *   4. Só então as queries — com o CLIENT DE SESSÃO (nunca service role):
 *      as policies client_read (RLS) são a segunda camada de isolamento.
 *
 * O parâmetro client_id existe exatamente para tornar o 403 testável de forma
 * explícita, conforme o AC do PRD — o guard compara com o claim ANTES de
 * qualquer acesso a dados.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const claim = user.user_metadata?.client_id as string | undefined
  if (!claim) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const requestedClientId = req.nextUrl.searchParams.get('client_id')
  if (!requestedClientId || requestedClientId !== claim) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const periodParam = Number(req.nextUrl.searchParams.get('period') ?? 30)
  const period: Period = (VALID_PERIODS as readonly number[]).includes(periodParam)
    ? (periodParam as Period)
    : 30

  const since = new Date()
  since.setDate(since.getDate() - period)
  const sinceISO = since.toISOString().split('T')[0]

  // Client de sessão — RLS client_read escopa tudo pelo claim (2ª camada)
  const { data: accounts, error: accountsError } = await supabase
    .from('ad_accounts')
    .select('id, account_name, platform')
    .eq('client_id', claim)

  if (accountsError) {
    return NextResponse.json({ error: 'Erro ao carregar contas' }, { status: 500 })
  }
  if (!accounts?.length) {
    return NextResponse.json({ accounts: [], period })
  }

  const accountIds = accounts.map((a) => a.id)

  const { data: campaigns } = await supabase
    .from('ad_campaigns')
    .select('id, ad_account_id')
    .in('ad_account_id', accountIds)

  const campaignToAccount = new Map<string, string>()
  for (const c of campaigns ?? []) campaignToAccount.set(c.id, c.ad_account_id)

  const campaignIds = [...campaignToAccount.keys()]

  const { data: metrics } = campaignIds.length
    ? await supabase
        .from('campaign_metrics')
        .select('campaign_id, spend, impressions, clicks, conversions, revenue')
        .in('campaign_id', campaignIds)
        .gte('date', sinceISO)
    : { data: [] }

  // Agregar por conta
  const totalsByAccount = new Map<string, MetricTotals>()
  for (const a of accounts) {
    totalsByAccount.set(a.id, { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 })
  }
  for (const m of metrics ?? []) {
    const accountId = campaignToAccount.get(m.campaign_id)
    if (!accountId) continue
    const t = totalsByAccount.get(accountId)
    if (!t) continue
    t.spend += Number(m.spend)
    t.impressions += Number(m.impressions)
    t.clicks += Number(m.clicks)
    t.conversions += Number(m.conversions)
    t.revenue += Number(m.revenue)
  }

  const result: ClienteAccountMetrics[] = accounts.map((a) => {
    const totals = totalsByAccount.get(a.id)!
    return {
      account_id: a.id,
      account_name: a.account_name,
      platform: a.platform,
      totals,
      health: computeHealth(totals),
    }
  })

  return NextResponse.json({ accounts: result, period })
}

/**
 * Indicador de saúde por cor (AC 3.8.4):
 *   verde   — investimento com retorno (roas >= 1 ou CPL definido com conversões)
 *   amarelo — gastando com pouco resultado
 *   vermelho — gastando sem nenhuma conversão
 *   sem gasto no período → verde (nada errado, apenas inativa)
 */
function computeHealth(t: MetricTotals): 'green' | 'yellow' | 'red' {
  if (t.spend === 0) return 'green'
  if (t.conversions === 0 && t.revenue === 0) return 'red'
  if (t.revenue > 0 && t.revenue / t.spend >= 1) return 'green'
  if (t.conversions > 0) return 'green'
  return 'yellow'
}
