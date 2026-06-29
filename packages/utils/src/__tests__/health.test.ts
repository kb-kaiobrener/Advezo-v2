import { describe, it, expect } from 'vitest'
import { calculateHealthScore } from '../health'

describe('calculateHealthScore', () => {
  it('retorna 0 quando totalSpend é 0 (sem dados)', () => {
    expect(
      calculateHealthScore({
        totalSpend: 0,
        totalRevenue: 0,
        totalClicks: 0,
        totalImpressions: 0,
        totalConversions: 0,
      }),
    ).toBe(0)
  })

  it('retorna score verde (>=70) com ROAS alto e CTR alto', () => {
    // ROAS = 5000/1000 = 5 (máximo), CTR = 100/1000 = 10% (máximo)
    const score = calculateHealthScore({
      totalSpend: 1000,
      totalRevenue: 5000,
      totalClicks: 100,
      totalImpressions: 1000,
      totalConversions: 10,
    })
    expect(score).toBeGreaterThanOrEqual(70)
  })

  it('retorna score vermelho (<40) com ROAS baixo', () => {
    // ROAS = 500/1000 = 0.5, CTR = 1/1000 = 0.1%
    const score = calculateHealthScore({
      totalSpend: 1000,
      totalRevenue: 500,
      totalClicks: 1,
      totalImpressions: 1000,
      totalConversions: 0,
    })
    expect(score).toBeLessThan(40)
  })

  it('tendência de alta (S-1 > S-2) eleva o score em relação ao cenário neutro', () => {
    const base = {
      totalSpend: 1000,
      totalRevenue: 2000,
      totalClicks: 20,
      totalImpressions: 1000,
      totalConversions: 10,
    }
    const withUpTrend = calculateHealthScore({ ...base, previousSpend: 500 }) // spend dobrou
    const neutral = calculateHealthScore(base) // sem previousSpend → neutro
    expect(withUpTrend).toBeGreaterThan(neutral)
  })

  it('tendência de queda (S-1 < S-2) reduz o score em relação ao cenário neutro', () => {
    const base = {
      totalSpend: 500,
      totalRevenue: 1000,
      totalClicks: 10,
      totalImpressions: 500,
      totalConversions: 5,
    }
    const withDownTrend = calculateHealthScore({ ...base, previousSpend: 1000 }) // spend caiu 50%
    const neutral = calculateHealthScore(base)
    expect(withDownTrend).toBeLessThan(neutral)
  })

  it('previousSpend undefined não quebra o cálculo e produz score idêntico ao cenário neutro', () => {
    const base = {
      totalSpend: 1000,
      totalRevenue: 2000,
      totalClicks: 20,
      totalImpressions: 1000,
      totalConversions: 10,
    }
    const scoreExplicitUndefined = calculateHealthScore({ ...base, previousSpend: undefined })
    const scoreOmitted = calculateHealthScore(base)
    expect(scoreExplicitUndefined).toBe(scoreOmitted)
  })
})
