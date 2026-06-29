import { describe, it, expect } from 'vitest'
import {
  ALERT_THRESHOLD_DAYS,
  ALERT_RESOLVE_DAYS,
  averageDailySpend,
  calculateProjectedDays,
  shouldAlert,
  shouldResolve,
} from '@/lib/alerts/balance'

/**
 * Testes unitários — lógica pura de detecção de saldo (Story 2.9 — AC 2.9.8 a/b).
 *
 * Cobre as funções determinísticas: média de gasto, projeção de dias, decisão de
 * alertar e decisão de resolver. Sem I/O — apenas números entram e saem.
 */

describe('averageDailySpend (Story 2.9)', () => {
  it('divide o total pela janela de 7 dias (dias sem gasto contam como 0)', () => {
    // 70 gastos em 7 linhas (uma por dia) → 10/dia.
    expect(averageDailySpend([10, 10, 10, 10, 10, 10, 10], 7)).toBe(10)
  })

  it('contabiliza dias sem gasto: 70 em 5 linhas / 7 dias = 10/dia', () => {
    expect(averageDailySpend([14, 14, 14, 14, 14], 7)).toBe(10)
  })

  it('janela vazia → 0', () => {
    expect(averageDailySpend([], 7)).toBe(0)
  })

  it('windowDays <= 0 → 0 (sem divisão por zero)', () => {
    expect(averageDailySpend([10, 20], 0)).toBe(0)
  })

  it('ignora valores não finitos no somatório', () => {
    expect(averageDailySpend([7, Number.NaN, 7], 7)).toBe(2)
  })
})

describe('calculateProjectedDays (Story 2.9)', () => {
  it('saldo / gasto diário = dias projetados', () => {
    expect(calculateProjectedDays(10, 50)).toBe(5)
  })

  it('gasto diário 0 → Infinity (conta sem gasto, sem risco)', () => {
    expect(calculateProjectedDays(0, 100)).toBe(Infinity)
  })

  it('gasto diário negativo/inválido → Infinity', () => {
    expect(calculateProjectedDays(-5, 100)).toBe(Infinity)
    expect(calculateProjectedDays(Number.NaN, 100)).toBe(Infinity)
  })

  it('saldo <= 0 → 0 dias (saldo esgotado, alerta imediato)', () => {
    expect(calculateProjectedDays(10, 0)).toBe(0)
    expect(calculateProjectedDays(10, -20)).toBe(0)
  })
})

describe('shouldAlert (Story 2.9 — AC 2.9.8 a/b)', () => {
  it('a) projeção ABAIXO do threshold (7) → alerta', () => {
    expect(shouldAlert(6.9)).toBe(true)
    expect(shouldAlert(0)).toBe(true)
  })

  it('b) projeção >= threshold → NÃO alerta', () => {
    expect(shouldAlert(7)).toBe(false)
    expect(shouldAlert(30)).toBe(false)
    expect(shouldAlert(Infinity)).toBe(false)
  })

  it('threshold default é 7 dias', () => {
    expect(ALERT_THRESHOLD_DAYS).toBe(7)
  })
})

describe('shouldResolve (Story 2.9 — AC 2.9.6a)', () => {
  it('resolve quando projeção recupera para >= 2x threshold (14)', () => {
    expect(shouldResolve(14)).toBe(true)
    expect(shouldResolve(20)).toBe(true)
    expect(shouldResolve(Infinity)).toBe(true)
  })

  it('NÃO resolve enquanto projeção < 2x threshold (folga anti-flicker)', () => {
    expect(shouldResolve(13.9)).toBe(false)
    expect(shouldResolve(7)).toBe(false)
  })

  it('a folga de resolução é o dobro do threshold', () => {
    expect(ALERT_RESOLVE_DAYS).toBe(ALERT_THRESHOLD_DAYS * 2)
  })
})
