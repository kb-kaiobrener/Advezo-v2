import { describe, it, expect } from 'vitest'
import { calculateHealthScore } from '../health'

describe('calculateHealthScore', () => {
  it('retorna 0 para dados ausentes', () => {
    expect(calculateHealthScore({})).toBe(0)
  })

  it('retorna 0 para dados zerados (stub Epic 1)', () => {
    expect(calculateHealthScore({ roas: 0, spend: 0 })).toBe(0)
  })

  it('retorna 0 mesmo com dados presentes (stub)', () => {
    expect(calculateHealthScore({ roas: 3.2, spend: 1000, budget: 2000 })).toBe(0)
  })
})
