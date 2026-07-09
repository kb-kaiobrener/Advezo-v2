import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processIncomingMessage, hashPhone } from '../tracking.js'

type Row = Record<string, unknown>
function makeDb(tables: Record<string, Row[] | Row | null>) {
  const counters: Record<string, number> = {}
  const writes: Array<{ table: string; op: string; payload?: unknown }> = []
  return {
    from: vi.fn((table: string) => {
      const idx = counters[table] ?? 0; counters[table] = idx + 1
      const val = Array.isArray(tables[table]) ? (tables[table] as Row[])[idx] ?? null : tables[table] ?? null
      const resolved = { data: val, error: null }
      const c: Record<string, unknown> = {}
      const rt = () => c
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) c[m] = vi.fn(rt)
      c.insert = vi.fn((p: unknown) => { writes.push({ table, op: 'insert', payload: p }); return Promise.resolve({ error: null }) })
      c.update = vi.fn((p: unknown) => { writes.push({ table, op: 'update', payload: p }); return c })
      c.maybeSingle = vi.fn().mockResolvedValue(resolved)
      c.then = (r: (v: unknown) => unknown) => Promise.resolve(resolved).then(r)
      return c
    }),
    _writes: writes,
  } as never
}

const P = { workspaceId: 'ws1', accountId: '5511900000000', remoteJid: '5511988887777@s.whatsapp.net' }
const CONN = { client_id: 'c1', notice_template: 'Oi! Este atendimento é rastreado.' }

beforeEach(() => { vi.stubEnv('GLOBAL_HMAC_SECRET', 's3cret'); vi.stubEnv('TRACKING_WINDOW_DAYS', '7') })

describe('hashPhone', () => {
  it('determinístico e por-workspace (salts diferentes → hashes diferentes)', () => {
    const a = hashPhone('5511988887777', 'ws1', 's')
    expect(a).toBe(hashPhone('5511988887777', 'ws1', 's'))
    expect(a).not.toBe(hashPhone('5511988887777', 'ws2', 's'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('processIncomingMessage', () => {
  it('grupo (@g.us) e fromMe são ignorados sem tocar o banco', async () => {
    const db = makeDb({})
    await processIncomingMessage({ ...P, remoteJid: '123@g.us' }, { db })
    expect((db as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('sem GLOBAL_HMAC_SECRET → pulado (coerente com 4.3)', async () => {
    vi.stubEnv('GLOBAL_HMAC_SECRET', '')
    const db = makeDb({})
    await processIncomingMessage(P, { db })
    expect((db as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('match LIFO → tracked + phone_matched + aviso ao titular', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }, { id: 'l2' }]],
      tracked_clicks: { id: 'clickMaisRecente', link_id: 'l2' },
    })
    const sendText = vi.fn().mockResolvedValue(undefined)
    await processIncomingMessage(P, { db, sendText })
    const w = (db as unknown as { _writes: Array<{ table: string; op: string; payload: Row }> })._writes
    const ins = w.find(x => x.table === 'tracked_conversations')!
    expect(ins.payload).toMatchObject({
      status: 'tracked', link_id: 'l2', click_id: 'clickMaisRecente',
      workspace_id: 'ws1', client_id: 'c1',
      phone_number_hash: hashPhone('5511988887777', 'ws1', 's3cret'),
    })
    expect(JSON.stringify(ins.payload)).not.toContain('5511988887777') // LGPD: nunca em claro
    expect(w.find(x => x.table === 'tracked_clicks')?.payload).toEqual({ phone_matched: true })
    expect(sendText).toHaveBeenCalledWith(P.remoteJid, CONN.notice_template) // AC 4.4.6
  })

  it('sem clique na janela → UNTRACKED (nunca ignorada) e sem aviso', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }]],
      tracked_clicks: null,
    })
    const sendText = vi.fn()
    await processIncomingMessage(P, { db, sendText })
    const ins = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
      .find(x => x.table === 'tracked_conversations')!
    expect(ins.payload).toMatchObject({ status: 'untracked', link_id: null, click_id: null })
    expect(sendText).not.toHaveBeenCalled()
  })

  it('conversa já existente → não duplica nem reenvia aviso', async () => {
    const db = makeDb({ whatsapp_connections: CONN, tracked_conversations: [{ id: 'tc1' }] })
    const sendText = vi.fn()
    await processIncomingMessage(P, { db, sendText })
    expect((db as unknown as { _writes: unknown[] })._writes).toHaveLength(0)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('falha no envio do aviso NÃO desfaz o tracking (conversa fica tracked)', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }]],
      tracked_clicks: { id: 'k1', link_id: 'l1' },
    })
    const sendText = vi.fn().mockRejectedValue(new Error('socket down'))
    await processIncomingMessage(P, { db, sendText })
    const w = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
    expect(w.find(x => x.table === 'tracked_conversations')?.payload).toMatchObject({ status: 'tracked' })
  })

  it('conta sem whatsapp_connection → pulado sem escrita', async () => {
    const db = makeDb({ whatsapp_connections: null })
    await processIncomingMessage(P, { db })
    expect((db as unknown as { _writes: unknown[] })._writes).toHaveLength(0)
  })
})
