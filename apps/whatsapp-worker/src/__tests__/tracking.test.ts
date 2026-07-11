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
      c.insert = vi.fn((p: unknown) => {
        writes.push({ table, op: 'insert', payload: p })
        const ins: Record<string, unknown> = {
          select: vi.fn(() => ins),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
          then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
        }
        return ins
      })
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

  it('MAINT-01 AC1: claim perdido → tenta o PRÓXIMO candidato (nunca o mesmo click_id)', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }]],
      // select candA → claim FALHA (rival levou) → select candB → claim OK
      tracked_clicks: [{ id: 'candA', link_id: 'l1' }, null, { id: 'candB', link_id: 'l1' }, { id: 'candB' }],
      conversation_classification_queue: [null],
    })
    await processIncomingMessage(P, { db, sendText: vi.fn().mockResolvedValue(undefined) })
    const ins = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
      .find(x => x.table === 'tracked_conversations')!
    expect(ins.payload).toMatchObject({ status: 'tracked', click_id: 'candB' })
  })

  it('MAINT-01 AC1: todos os claims perdidos e sem candidatos → UNTRACKED', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }]],
      tracked_clicks: [{ id: 'candA', link_id: 'l1' }, null, null], // claim falha, próximo select vazio
      conversation_classification_queue: [null],
    })
    await processIncomingMessage(P, { db })
    const ins = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
      .find(x => x.table === 'tracked_conversations')!
    expect(ins.payload).toMatchObject({ status: 'untracked', click_id: null })
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

  it('conversa existente UNTRACKED → sem escrita, fila ignorada (AC 5.2.3)', async () => {
    const db = makeDb({ whatsapp_connections: CONN, tracked_conversations: [{ id: 'tc1', status: 'untracked' }] })
    const sendText = vi.fn()
    await processIncomingMessage(P, { db, sendText })
    expect((db as unknown as { _writes: unknown[] })._writes).toHaveLength(0)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('conversa existente TRACKED → enfileira p/ classificação (Story 5.2), sem reenviar aviso', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [{ id: 'tc1', status: 'tracked' }],
      conversation_classification_queue: [null], // sem item anterior → INSERT
    })
    const sendText = vi.fn()
    await processIncomingMessage(P, { db, sendText })
    const w = (db as unknown as { _writes: Array<{ table: string; op: string; payload: Row }> })._writes
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ table: 'conversation_classification_queue', op: 'insert', payload: { workspace_id: 'ws1', conversation_id: 'tc1', retry_count: 0 } })
    expect(sendText).not.toHaveBeenCalled()
  })

  it('mensagem de conversa tracked é armazenada CIFRADA (nunca texto puro)', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64))
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [{ id: 'tc1', status: 'tracked' }],
      conversation_classification_queue: [null],
    })
    await processIncomingMessage({ ...P, messageText: 'quero comprar o plano anual' }, { db })
    const w = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
    const msg = w.find(x => x.table === 'conversation_messages')!
    expect(msg.payload).toMatchObject({ direction: 'in', conversation_id: 'tc1' })
    const enc = String((msg.payload as Row).content_encrypted)
    expect(enc).not.toContain('quero comprar')
    expect(enc.split(':')).toHaveLength(3) // iv:tag:ciphertext
  })

  it('sem TOKEN_ENCRYPTION_KEY → mensagem NÃO gravada (nunca texto puro)', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '')
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [{ id: 'tc1', status: 'tracked' }],
      conversation_classification_queue: [null],
    })
    await processIncomingMessage({ ...P, messageText: 'oi' }, { db })
    const w = (db as unknown as { _writes: Array<{ table: string }> })._writes
    expect(w.some(x => x.table === 'conversation_messages')).toBe(false)
  })

  it('fila com item pending → refresh, não duplica (AC 5.2.2)', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [{ id: 'tc1', status: 'tracked' }],
      conversation_classification_queue: [{ id: 'q1', status: 'pending', processed_at: null }, null],
    })
    await processIncomingMessage(P, { db })
    const w = (db as unknown as { _writes: Array<{ table: string; op: string; payload: Row }> })._writes
    expect(w).toHaveLength(1)
    expect(w[0].op).toBe('update')
    expect(Object.keys(w[0].payload)).toEqual(['created_at'])
  })

  it('classificação done há <1h → reingesta na MESMA linha com retry_count=0 (AC 5.2.2/5.2.5)', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [{ id: 'tc1', status: 'tracked' }],
      conversation_classification_queue: [{ id: 'q1', status: 'done', processed_at: new Date(Date.now() - 10 * 60_000).toISOString() }, null],
    })
    await processIncomingMessage(P, { db })
    const w = (db as unknown as { _writes: Array<{ table: string; op: string; payload: Row }> })._writes
    expect(w[0]).toMatchObject({ op: 'update', payload: { status: 'pending', retry_count: 0 } })
  })

  it('nova conversa TRACKED → também entra na fila', async () => {
    const db = makeDb({
      whatsapp_connections: CONN,
      tracked_conversations: [null],
      tracking_links: [[{ id: 'l1' }]],
      tracked_clicks: { id: 'k1', link_id: 'l1' },
      conversation_classification_queue: [null],
    })
    await processIncomingMessage(P, { db, sendText: vi.fn().mockResolvedValue(undefined) })
    const w = (db as unknown as { _writes: Array<{ table: string; payload: Row }> })._writes
    expect(w.some(x => x.table === 'conversation_classification_queue')).toBe(true)
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
