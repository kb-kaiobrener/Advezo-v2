import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { createTrackingLink, toggleTrackingLink, generateTrackingCode } from '@/app/actions/tracking-links'
import { GET as trackingRedirect } from '@/app/t/[code]/route'
import { NextRequest } from 'next/server'

const mockServer = vi.mocked(createSupabaseServerClient)
const mockService = vi.mocked(createSupabaseServiceClient)

function makeAuth(userId: string | null = 'u1') {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) } }
}
function makeService(tables: Record<string, unknown[]>) {
  const counters: Record<string, number> = {}
  const writes: Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }> = []
  return {
    from: vi.fn((table: string) => {
      const idx = counters[table] ?? 0; counters[table] = idx + 1
      const resolved = { data: tables[table]?.[idx] ?? null, error: null }
      const filters: unknown[] = []
      const chain: Record<string, unknown> = {}
      const rt = () => chain
      chain.select = vi.fn(rt); chain.is = vi.fn(rt); chain.limit = vi.fn(rt)
      chain.eq = vi.fn((...a: unknown[]) => { filters.push(a); return chain })
      chain.insert = vi.fn((p: unknown) => { writes.push({ table, op: 'insert', payload: p, filters }); return Promise.resolve({ error: null }) })
      chain.update = vi.fn((p: unknown) => { writes.push({ table, op: 'update', payload: p, filters }); return chain })
      chain.single = vi.fn().mockResolvedValue(resolved)
      chain.maybeSingle = vi.fn().mockResolvedValue(resolved)
      chain.then = (r: (v: unknown) => unknown) => Promise.resolve(resolved).then(r)
      return chain
    }),
    _writes: writes,
  }
}

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('GLOBAL_HMAC_SECRET', 's3cret') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('generateTrackingCode', () => {
  it('8 chars do alfabeto seguro, aleatório', async () => {
    const a = await generateTrackingCode(); const b = await generateTrackingCode()
    expect(a).toMatch(/^[a-z2-9]{8}$/); expect(a).not.toBe(b)
  })
})

describe('createTrackingLink', () => {
  it('rejeita WhatsApp inválido pré-auth', async () => {
    const r = await createTrackingLink({ client_id: 'c1', source_type: 'custom', source_meta: {}, destination_whatsapp: 'abc' })
    expect(r).toMatchObject({ error: expect.stringContaining('WhatsApp inválido') })
    expect(mockService).not.toHaveBeenCalled()
  })
  it('rejeita code fora do formato pré-auth', async () => {
    const r = await createTrackingLink({ client_id: 'c1', source_type: 'custom', source_meta: {}, destination_whatsapp: '5511999998888', code: 'X!' })
    expect(r).toMatchObject({ error: expect.stringContaining('Código inválido') })
  })
  it('IDOR: cliente de outro workspace → erro, sem insert', async () => {
    mockServer.mockResolvedValue(makeAuth() as never)
    const svc = makeService({ workspace_members: [{ workspace_id: 'ws1' }], clients: [null] })
    mockService.mockReturnValue(svc as never)
    const r = await createTrackingLink({ client_id: 'alheio', source_type: 'custom', source_meta: {}, destination_whatsapp: '5511999998888' })
    expect(r).toEqual({ error: 'Cliente não encontrado' })
    expect(svc._writes).toHaveLength(0)
  })
  it('sucesso: insere com workspace do claim e code normalizado', async () => {
    mockServer.mockResolvedValue(makeAuth() as never)
    const svc = makeService({ workspace_members: [{ workspace_id: 'ws1' }], clients: [{ id: 'c1' }] })
    mockService.mockReturnValue(svc as never)
    const r = await createTrackingLink({ client_id: 'c1', source_type: 'meta_ad', source_meta: { label: 'x' }, destination_whatsapp: '+55 11 99999 8888', code: 'PROMO-01' })
    expect(r).toMatchObject({ success: true, code: 'promo-01' })
    expect(svc._writes[0]).toMatchObject({ table: 'tracking_links', op: 'insert', payload: { workspace_id: 'ws1', code: 'promo-01', destination_whatsapp: '5511999998888' } })
  })
})

describe('toggleTrackingLink', () => {
  it('filtra por id + workspace (IDOR)', async () => {
    mockServer.mockResolvedValue(makeAuth() as never)
    const svc = makeService({ workspace_members: [{ workspace_id: 'ws1' }], tracking_links: [null] })
    mockService.mockReturnValue(svc as never)
    await toggleTrackingLink('l1', false)
    const w = svc._writes.find(x => x.table === 'tracking_links')
    expect(w?.payload).toEqual({ active: false })
    expect(w?.filters).toContainEqual(['id', 'l1'])
    expect(w?.filters).toContainEqual(['workspace_id', 'ws1'])
  })
})

describe('GET /t/[code]', () => {
  const req = (code: string, gclid?: string) =>
    trackingRedirect(
      new NextRequest(`http://localhost/t/${code}${gclid ? `?gclid=${gclid}` : ''}`, {
        headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA-Test' },
      }),
      { params: Promise.resolve({ code }) }
    )
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://sb.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')
  })

  it('inexistente → 404 com página customizada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [] }))
    const res = await req('nada1234')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('Link não encontrado')
  })
  it('inativo → 302 para /link-indisponivel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [{ id: 'l1', workspace_id: 'ws1', destination_whatsapp: '5511999998888', active: false }] }))
    const res = await req('inativo1')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/link-indisponivel')
  })
  it('ativo → 302 wa.me e loga clique com gclid + ip_hash (nunca IP puro)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => [{ id: 'l1', workspace_id: 'ws1', destination_whatsapp: '5511999998888', active: true }] })
      .mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const res = await req('ativo123', 'GC123')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://wa.me/5511999998888')
    // aguardar o fire-and-forget
    await new Promise(r => setTimeout(r, 20))
    const logCall = fetchMock.mock.calls.find(c => String(c[0]).includes('tracked_clicks'))
    expect(logCall).toBeTruthy()
    const body = JSON.parse((logCall![1] as RequestInit).body as string)
    expect(body).toMatchObject({ link_id: 'l1', gclid: 'GC123', user_agent: 'UA-Test' })
    expect(body.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(body)).not.toContain('1.2.3.4')
  })
  it('sem GLOBAL_HMAC_SECRET → redirect normal, mas NENHUM clique logado (nunca hash com segredo vazio)', async () => {
    vi.stubEnv('GLOBAL_HMAC_SECRET', '')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => [{ id: 'l1', workspace_id: 'ws1', destination_whatsapp: '5511999998888', active: true }] })
      .mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const res = await req('ativo123')
    expect(res.status).toBe(302)
    await new Promise(r => setTimeout(r, 20))
    expect(fetchMock.mock.calls.find(c => String(c[0]).includes('tracked_clicks'))).toBeUndefined()
  })

  it('falha no log NÃO impede o redirect (AC 4.3.4)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => [{ id: 'l1', workspace_id: 'ws1', destination_whatsapp: '5511999998888', active: true }] })
      .mockRejectedValue(new Error('down'))
    vi.stubGlobal('fetch', fetchMock)
    const res = await req('ativo123')
    expect(res.status).toBe(302)
  })
})
