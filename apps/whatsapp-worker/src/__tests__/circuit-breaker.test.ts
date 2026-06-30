import { describe, it, expect, vi } from 'vitest'
import {
  CircuitBreaker,
  readConfig,
  DEFAULT_THRESHOLD,
  DEFAULT_WINDOW_MS,
  type UpdateAccountFn,
} from '../circuit-breaker.js'

/**
 * Helper: cria um breaker com relógio controlado e um spy de update injetado,
 * isolando a lógica do banco (DI). `clock` é um objeto mutável para avançar o tempo.
 */
function makeBreaker(opts?: { threshold?: number; windowMs?: number; start?: number }) {
  const clock = { now: opts?.start ?? 1_000_000 }
  const update = vi.fn<UpdateAccountFn>(async () => {})
  const cb = new CircuitBreaker({
    threshold: opts?.threshold ?? 5,
    windowMs: opts?.windowMs ?? DEFAULT_WINDOW_MS,
    updateAccount: update,
    now: () => clock.now,
  })
  return { cb, update, clock }
}

const WS = 'ws-1'
const ACC = '5511999998888'

describe('CircuitBreaker.recordFailure', () => {
  it('4 falhas dentro da janela NÃO pausam o circuit', async () => {
    const { cb, update } = makeBreaker()
    let last
    for (let i = 0; i < 4; i++) {
      last = await cb.recordFailure(WS, ACC)
    }
    expect(last?.paused).toBe(false)
    expect(last?.failureCount).toBe(4)
    expect(cb.isPaused).toBe(false)
    // Cada falha grava apenas cb_failure_count, nunca cb_paused_at
    for (const call of update.mock.calls) {
      expect(call[2]).not.toHaveProperty('cb_paused_at')
    }
  })

  it('5ª falha na janela pausa o circuit e grava cb_paused_at', async () => {
    const { cb, update } = makeBreaker()
    let last
    for (let i = 0; i < 5; i++) {
      last = await cb.recordFailure(WS, ACC)
    }
    expect(last?.paused).toBe(true)
    expect(last?.failureCount).toBe(5)
    expect(cb.isPaused).toBe(true)

    const lastPatch = update.mock.calls.at(-1)?.[2] as Record<string, unknown>
    expect(lastPatch.status).toBe('cb_paused')
    expect(lastPatch.cb_paused_at).toBeTypeOf('string')
    expect(lastPatch.cb_failure_count).toBe(5)
  })

  it('falhas fora da janela de 10 min são descartadas (janela deslizante)', async () => {
    const { cb, clock } = makeBreaker({ windowMs: 10 * 60 * 1000 })
    // 4 falhas no tempo 0
    for (let i = 0; i < 4; i++) await cb.recordFailure(WS, ACC)
    // Avança 11 min — as 4 falhas saem da janela
    clock.now += 11 * 60 * 1000
    const result = await cb.recordFailure(WS, ACC)
    // Apenas 1 falha dentro da janela atual
    expect(result.failureCount).toBe(1)
    expect(result.paused).toBe(false)
  })

  it('5 falhas espalhadas mas dentro da janela ainda pausam', async () => {
    const { cb, clock } = makeBreaker({ windowMs: 10 * 60 * 1000 })
    for (let i = 0; i < 4; i++) {
      await cb.recordFailure(WS, ACC)
      clock.now += 60 * 1000 // +1 min cada
    }
    // 4 min depois da 1ª, ainda dentro de 10 min → a 5ª pausa
    const result = await cb.recordFailure(WS, ACC)
    expect(result.failureCount).toBe(5)
    expect(result.paused).toBe(true)
  })
})

describe('CircuitBreaker.recordSuccess', () => {
  it('reseta a janela em memória e o estado persistido após sucesso', async () => {
    const { cb, update } = makeBreaker()
    for (let i = 0; i < 4; i++) await cb.recordFailure(WS, ACC)
    expect(cb.isPaused).toBe(false)

    await cb.recordSuccess(WS, ACC)
    expect(cb.isPaused).toBe(false)

    const patch = update.mock.calls.at(-1)?.[2] as Record<string, unknown>
    expect(patch.status).toBe('connected')
    expect(patch.cb_failure_count).toBe(0)
    expect(patch.cb_paused_at).toBeNull()
    expect(patch.connected_at).toBeTypeOf('string')
  })

  it('após reset, a contagem recomeça do zero', async () => {
    const { cb } = makeBreaker()
    for (let i = 0; i < 4; i++) await cb.recordFailure(WS, ACC)
    await cb.recordSuccess(WS, ACC)
    const result = await cb.recordFailure(WS, ACC)
    expect(result.failureCount).toBe(1)
    expect(result.paused).toBe(false)
  })
})

describe('readConfig', () => {
  it('usa defaults quando env ausente/inválido', () => {
    expect(readConfig({})).toEqual({ threshold: DEFAULT_THRESHOLD, windowMs: DEFAULT_WINDOW_MS })
    expect(readConfig({ CB_FAILURE_THRESHOLD: 'abc', CB_WINDOW_MINUTES: '-1' })).toEqual({
      threshold: DEFAULT_THRESHOLD,
      windowMs: DEFAULT_WINDOW_MS,
    })
  })

  it('respeita valores válidos do env', () => {
    expect(readConfig({ CB_FAILURE_THRESHOLD: '3', CB_WINDOW_MINUTES: '5' })).toEqual({
      threshold: 3,
      windowMs: 5 * 60 * 1000,
    })
  })
})
