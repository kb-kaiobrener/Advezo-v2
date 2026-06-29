export interface WeekRange {
  label: string // 'S-4', 'S-3', 'S-2', 'S-1'
  start: string // 'YYYY-MM-DD'
  end: string // 'YYYY-MM-DD'
}

export function getWeekRanges(n = 4): WeekRange[] {
  const ranges: WeekRange[] = []
  const now = new Date()
  // Última segunda-feira passada (semana S-1 começa na segunda)
  const dayOfWeek = now.getDay() // 0=dom, 1=seg, ..., 6=sab
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  // Segunda da semana atual
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - daysToLastMonday)
  thisMonday.setHours(0, 0, 0, 0)
  // Segunda da semana passada (S-1)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)

  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(lastMonday)
    start.setDate(lastMonday.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    ranges.push({
      label: `S-${i + 1}`,
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    })
  }
  // Retorna [S-4, S-3, S-2, S-1] — ordem cronológica
  return ranges
}

export interface CampaignWeekData {
  campaignId: string
  campaignName: string
  platform: 'meta' | 'google'
  weeks: Record<string, { spend: number; conversions: number; roas: number }>
  // weeks keyed by label: 'S-4'...'S-1'
}

export function aggregateByWeek(
  metrics: Array<{
    campaign_id: string
    date: string
    spend: number | string
    revenue: number | string
    conversions: number | string
  }>,
  campaigns: Array<{ id: string; name: string; platform: string }>,
  weekRanges: WeekRange[]
): CampaignWeekData[] {
  // Agrupar por campanha, depois por semana
  const byCampaign: Record<
    string,
    Record<string, { spend: number; revenue: number; conversions: number }>
  > = {}

  for (const m of metrics) {
    if (!byCampaign[m.campaign_id]) byCampaign[m.campaign_id] = {}
    for (const week of weekRanges) {
      if (m.date >= week.start && m.date <= week.end) {
        if (!byCampaign[m.campaign_id][week.label]) {
          byCampaign[m.campaign_id][week.label] = { spend: 0, revenue: 0, conversions: 0 }
        }
        byCampaign[m.campaign_id][week.label].spend += Number(m.spend)
        byCampaign[m.campaign_id][week.label].revenue += Number(m.revenue)
        byCampaign[m.campaign_id][week.label].conversions += Number(m.conversions)
        break
      }
    }
  }

  return campaigns.map((c) => {
    const weeklyRaw = byCampaign[c.id] ?? {}
    const weeks: Record<string, { spend: number; conversions: number; roas: number }> = {}
    for (const week of weekRanges) {
      const raw = weeklyRaw[week.label] ?? { spend: 0, revenue: 0, conversions: 0 }
      weeks[week.label] = {
        spend: raw.spend,
        conversions: raw.conversions,
        roas: raw.spend > 0 ? raw.revenue / raw.spend : 0,
      }
    }
    return {
      campaignId: c.id,
      campaignName: c.name,
      platform: c.platform as 'meta' | 'google',
      weeks,
    }
  })
}

export function percentDelta(prev: number, curr: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}
