import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptToken } from '@advezo/utils'
import { processQueueItem, parseClassification, buildPrompt } from '../classifier.js'

const KEY = 'b'.repeat(64)
type Row = Record<string, unknown>
function makeDb(tables: Record<string, Row[] | Row | null>) {
  const counters: Record<string, number> = {}
  const writes: Array<{ table: string; op: string; payload: Row }> = []
  return {
    from: vi.fn((table: string) => {
      const idx = counters[table] ?? 0; counters[table] = idx + 1
      const val = Array.isArray(tables[table]) ? (tables[table] as Row[])[idx] ?? null : tables[table] ?? null
      const resolved = { data: val, error: null }
      const c: Record<string, unknown> = {}
      const rt = () => c
      for (const m of ['select', 'eq', 'order', 'limit']) c[m] = rt
      c.update = vi.fn((p: Row) => { writes.push({ table, op: 'update', payload: p }); return c })
      c.upsert = vi.fn((p: Row) => { writes.push({ table, op: 'upsert', payload: p }); return Promise.resolve({ error: null }) })
      c.maybeSingle = vi.fn().mockResolvedValue(resolved)
      c.then = (r: (v: unknown) => unknown) => Promise.resolve(resolved).then(r)
      return c
    }),
    _writes: writes,
  } as never
}
const ITEM = { id: 'q1', workspace_id: 'ws1', conversation_id: 'tc1', retry_count: 0 }
const MSGS = [
  { direction: 'in', content_encrypted: encryptToken('quero o plano anual', KEY) },
  { direction: 'out', content_encrypted: encryptToken('fechado, R$ 1200', KEY) },
]
const GOOD = JSON.stringify({ funnel_stage: 'sale', is_sale: true, sale_value_estimate: 1200, confidence_score: 0.92, reasoning: 'fechou' })

beforeEach(() => { vi.stubEnv('TOKEN_ENCRYPTION_KEY', KEY) })

describe('parseClassification', () => {
  it('valida shape e rejeita stage/score inválidos', () => {
    expect(parseClassification(GOOD).funnel_stage).toBe('sale')
    expect(() => parseClassification('{"funnel_stage":"x","is_sale":true,"confidence_score":0.5}')).toThrow()
    expect(() => parseClassification('nada')).toThrow()
  })

  it('MAINT-01 AC2: stage inválido do modelo NÃO vaza na mensagem de erro (queue.error)', () => {
    const malicious = 'cliente disse: meu cpf é 123'
    try {
      parseClassification(JSON.stringify({ funnel_stage: malicious, is_sale: true, confidence_score: 0.9 }))
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).not.toContain('cpf')
      expect((e as Error).message).not.toContain(malicious)
    }
  })
})

describe('processQueueItem', () => {
  it('sucesso: decripta, classifica, upsert com model_version, done + conversa classified', async () => {
    const db = makeDb({
      tracked_conversations: { id: 'tc1', status: 'tracked' },
      conversation_messages: [MSGS],
    })
    const callModel = vi.fn(async (prompt: string) => {
      expect(prompt).toContain('LEAD: quero o plano anual')       // decriptado em memória
      expect(prompt).toContain('ATENDENTE: fechado, R$ 1200')
      return { text: GOOD, modelVersion: 'claude-sonnet-4-6' }
    })
    await processQueueItem(ITEM, { db, callModel })
    const w = (db as unknown as { _writes: Array<{ table: string; op: string; payload: Row }> })._writes
    expect(w.find(x => x.op === 'upsert')?.payload).toMatchObject({
      conversation_id: 'tc1', funnel_stage: 'sale', is_sale: true,
      sale_value_estimate: 1200, confidence_score: 0.92, model_version: 'claude-sonnet-4-6',
    })
    expect(w.find(x => x.table === 'tracked_conversations')?.payload).toEqual({ classification_status: 'classified' })
    expect(w.filter(x => x.table === 'conversation_classification_queue').pop()?.payload).toMatchObject({ status: 'done' })
  })

  it('resposta inválida → retry (pending, retry_count+1)', async () => {
    const db = makeDb({ tracked_conversations: { id: 'tc1', status: 'tracked' }, conversation_messages: [MSGS] })
    await processQueueItem(ITEM, { db, callModel: async () => ({ text: 'sem json', modelVersion: 'm' }) })
    const last = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
      .filter(x => x.table === 'conversation_classification_queue').pop()!
    expect(last.payload).toMatchObject({ status: 'pending', retry_count: 1 })
  })

  it('3ª falha → failed PERMANENTE + conversa classification_status=failed (AC 5.3.6)', async () => {
    const db = makeDb({ tracked_conversations: { id: 'tc1', status: 'tracked' }, conversation_messages: [MSGS] })
    await processQueueItem({ ...ITEM, retry_count: 2 }, { db, callModel: async () => { throw new Error('api down') } })
    const w = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
    expect(w.filter(x => x.table === 'conversation_classification_queue').pop()?.payload)
      .toMatchObject({ status: 'failed', retry_count: 3 })
    expect(w.filter(x => x.table === 'tracked_conversations').pop()?.payload)
      .toEqual({ classification_status: 'failed' })
  })

  it('conversa untracked → done sem chamar o modelo (AC 5.3.8)', async () => {
    const db = makeDb({ tracked_conversations: { id: 'tc1', status: 'untracked' } })
    const callModel = vi.fn()
    await processQueueItem(ITEM, { db, callModel })
    expect(callModel).not.toHaveBeenCalled()
    const last = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes.pop()!
    expect(last.payload).toMatchObject({ status: 'done' })
  })
})

describe('buildPrompt', () => {
  it('exige JSON puro e inclui o histórico rotulado', () => {
    const p = buildPrompt([{ direction: 'in', text: 'oi' }])
    expect(p).toContain('APENAS com JSON')
    expect(p).toContain('LEAD: oi')
  })
})
