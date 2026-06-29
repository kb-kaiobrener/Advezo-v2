import { describe, it, expect } from 'vitest'
import { getWeekRanges, aggregateByWeek, percentDelta } from '@/lib/analytics/weekly'

describe('getWeekRanges', () => {
  it('retorna exatamente N semanas', () => {
    const ranges = getWeekRanges(4)
    expect(ranges).toHaveLength(4)
  })

  it('labels corretos: S-4 a S-1 em ordem cronológica', () => {
    const ranges = getWeekRanges(4)
    expect(ranges[0].label).toBe('S-4')
    expect(ranges[3].label).toBe('S-1')
  })

  it('cada semana tem 7 dias (start a end)', () => {
    const ranges = getWeekRanges(4)
    for (const r of ranges) {
      const start = new Date(r.start)
      const end = new Date(r.end)
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBe(6) // segunda a domingo = 6 dias de diferença
    }
  })
})

describe('percentDelta', () => {
  it('retorna null quando prev=0 (divisão por zero)', () => {
    expect(percentDelta(0, 100)).toBeNull()
  })

  it('calcula aumento corretamente', () => {
    expect(percentDelta(100, 150)).toBe(50)
  })

  it('calcula queda corretamente', () => {
    expect(percentDelta(200, 100)).toBe(-50)
  })
})

describe('aggregateByWeek', () => {
  it('agrega spend por campanha por semana', () => {
    const weekRanges = [{ label: 'S-1', start: '2026-06-15', end: '2026-06-21' }]
    const metrics = [
      { campaign_id: 'c1', date: '2026-06-16', spend: '100', revenue: '500', conversions: '5' },
      { campaign_id: 'c1', date: '2026-06-17', spend: '50', revenue: '200', conversions: '2' },
    ]
    const campaigns = [{ id: 'c1', name: 'Camp 1', platform: 'meta' }]

    const result = aggregateByWeek(metrics, campaigns, weekRanges)
    expect(result[0].weeks['S-1'].spend).toBeCloseTo(150)
    expect(result[0].weeks['S-1'].conversions).toBe(7)
  })

  it('calcula ROAS como revenue/spend', () => {
    const weekRanges = [{ label: 'S-1', start: '2026-06-15', end: '2026-06-21' }]
    const metrics = [
      { campaign_id: 'c1', date: '2026-06-16', spend: '100', revenue: '500', conversions: '5' },
    ]
    const campaigns = [{ id: 'c1', name: 'Camp 1', platform: 'meta' }]

    const result = aggregateByWeek(metrics, campaigns, weekRanges)
    expect(result[0].weeks['S-1'].roas).toBeCloseTo(5)
  })

  it('ROAS=0 quando não há spend (sem divisão por zero)', () => {
    const weekRanges = [{ label: 'S-1', start: '2026-06-15', end: '2026-06-21' }]
    const campaigns = [{ id: 'c1', name: 'Camp 1', platform: 'meta' }]

    const result = aggregateByWeek([], campaigns, weekRanges)
    expect(result[0].weeks['S-1'].roas).toBe(0)
    expect(result[0].weeks['S-1'].spend).toBe(0)
  })

  it('ignora métricas fora dos ranges de semana', () => {
    const weekRanges = [{ label: 'S-1', start: '2026-06-15', end: '2026-06-21' }]
    const metrics = [
      { campaign_id: 'c1', date: '2026-06-10', spend: '999', revenue: '999', conversions: '99' },
    ]
    const campaigns = [{ id: 'c1', name: 'Camp 1', platform: 'meta' }]

    const result = aggregateByWeek(metrics, campaigns, weekRanges)
    expect(result[0].weeks['S-1'].spend).toBe(0)
  })
})
