import { createSupabaseServiceClient } from '@advezo/database'

export interface Period {
  from: Date
  to: Date
}

type ReportType = 'vendas' | 'leads' | 'mensagens' | 'default'

interface Totals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

// ── Formatadores PT-BR (AC 3.4.3) ────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const numberFmt = new Intl.NumberFormat('pt-BR')
const percentFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatBRL(n: number): string {
  return currencyFmt.format(n)
}

export function formatNumber(n: number): string {
  return numberFmt.format(n)
}

export function formatPercent(ratio: number): string {
  return percentFmt.format(ratio)
}

export function formatMultiplier(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}x`
}

// ── Classificação de objetivo (AC 3.4.2) ─────────────────────────────────────

export function classifyObjectives(objectives: string[]): ReportType {
  const joined = objectives.join(' ').toUpperCase()
  if (/SALES|CONVERSIONS|PURCHASE/.test(joined)) return 'vendas'
  if (/LEAD/.test(joined)) return 'leads'
  if (/MESSAGES|MESSAGING|ENGAGEMENT/.test(joined)) return 'mensagens'
  return 'default'
}

// ── Agregação de métricas ─────────────────────────────────────────────────────

export function aggregateMetrics(
  metrics: Array<{
    spend: number | string
    impressions: number | string
    clicks: number | string
    conversions: number | string
    revenue: number | string
  }>
): Totals {
  return metrics.reduce<Totals>(
    (acc, m) => ({
      spend:       acc.spend       + Number(m.spend),
      impressions: acc.impressions + Number(m.impressions),
      clicks:      acc.clicks      + Number(m.clicks),
      conversions: acc.conversions + Number(m.conversions),
      revenue:     acc.revenue     + Number(m.revenue),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
  )
}

// ── Templates de texto (AC 3.4.3) ────────────────────────────────────────────

function formatPeriodHeader(period: Period): string {
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return `Período: ${fmt(period.from)} a ${fmt(period.to)}`
}

export function buildEmptyReport(period: Period): string {
  return [
    `📊 *Relatório de Campanhas*`,
    formatPeriodHeader(period),
    ``,
    `Nenhuma campanha ou métrica encontrada para o período.`,
    ``,
    `_Gerado automaticamente pelo Advezo._`,
  ].join('\n')
}

export function buildReport(type: ReportType, totals: Totals, period: Period): string {
  const header = formatPeriodHeader(period)
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0

  switch (type) {
    case 'vendas': {
      const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0
      return [
        `📊 *Relatório de Vendas*`,
        header,
        ``,
        `💰 *Investimento:* ${formatBRL(totals.spend)}`,
        `📈 *Impressões:* ${formatNumber(totals.impressions)}`,
        `👆 *Cliques:* ${formatNumber(totals.clicks)} (CTR: ${formatPercent(ctr)})`,
        ``,
        `🎯 *Conversões:* ${formatNumber(totals.conversions)}`,
        `💵 *Receita:* ${formatBRL(totals.revenue)}`,
        `🏆 *ROAS:* ${formatMultiplier(roas)}`,
        ``,
        `_Gerado automaticamente pelo Advezo._`,
      ].join('\n')
    }

    case 'leads': {
      const cpl = totals.conversions > 0 ? totals.spend / totals.conversions : 0
      return [
        `📊 *Relatório de Leads*`,
        header,
        ``,
        `💰 *Investimento:* ${formatBRL(totals.spend)}`,
        `📈 *Impressões:* ${formatNumber(totals.impressions)}`,
        `👆 *Cliques:* ${formatNumber(totals.clicks)} (CTR: ${formatPercent(ctr)})`,
        ``,
        `🎯 *Leads gerados:* ${formatNumber(totals.conversions)}`,
        `💡 *CPL:* ${formatBRL(cpl)}`,
        ``,
        `_Gerado automaticamente pelo Advezo._`,
      ].join('\n')
    }

    case 'mensagens': {
      const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
      return [
        `📊 *Relatório de Mensagens*`,
        header,
        ``,
        `💰 *Investimento:* ${formatBRL(totals.spend)}`,
        `📈 *Impressões:* ${formatNumber(totals.impressions)}`,
        `💬 *Mensagens:* ${formatNumber(totals.conversions)}`,
        `💡 *CPM:* ${formatBRL(cpm)}`,
        ``,
        `_Gerado automaticamente pelo Advezo._`,
      ].join('\n')
    }

    default: {
      return [
        `📊 *Relatório de Campanhas*`,
        header,
        ``,
        `💰 *Investimento:* ${formatBRL(totals.spend)}`,
        `📈 *Impressões:* ${formatNumber(totals.impressions)}`,
        `👆 *Cliques:* ${formatNumber(totals.clicks)} (CTR: ${formatPercent(ctr)})`,
        ``,
        `_Gerado automaticamente pelo Advezo._`,
      ].join('\n')
    }
  }
}

// ── Função principal (AC 3.4.1 / 3.4.4) ──────────────────────────────────────

export async function generateReport(
  workspaceId: string,
  clientId: string,
  period: Period
): Promise<string> {
  const db = createSupabaseServiceClient()

  const { data: accounts } = await db
    .from('ad_accounts')
    .select('id')
    .eq('client_id', clientId)
    .eq('workspace_id', workspaceId)

  if (!accounts?.length) return buildEmptyReport(period)
  const accountIds = accounts.map((a) => a.id)

  const { data: campaigns } = await db
    .from('ad_campaigns')
    .select('id, objective')
    .in('ad_account_id', accountIds)
    .eq('workspace_id', workspaceId)

  if (!campaigns?.length) return buildEmptyReport(period)
  const campaignIds = campaigns.map((c) => c.id)

  const fromStr = period.from.toISOString().split('T')[0]
  const toStr   = period.to.toISOString().split('T')[0]

  const { data: metrics } = await db
    .from('campaign_metrics')
    .select('campaign_id, impressions, clicks, spend, conversions, revenue')
    .in('campaign_id', campaignIds)
    .gte('date', fromStr)
    .lte('date', toStr)

  if (!metrics?.length) return buildEmptyReport(period)

  const totals = aggregateMetrics(metrics)
  const objectives = campaigns.map((c) => c.objective ?? '')
  const type = classifyObjectives(objectives)

  return buildReport(type, totals, period)
}
