import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { saveAlertDestination } from '@/app/actions/alert-destination'
import { GET as cronSendAlerts } from '@/app/api/cron/send-alerts/route'
import { NextRequest } from 'next/server'

const mockCreateServerClient = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)

// ── Helpers de mock ──────────────────────────────────────────────────────────

function makeServerClient(userId: string | null = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  }
}

interface TableResponses {
  [table: string]: unknown[]
}

function makeServiceClientByTable(responses: TableResponses) {
  const counters: Record<string, number> = {}
  const updates: Array<{ table: string; payload: unknown; filters: unknown[] }> = []

  function chainFor(table: string) {
    const idx = counters[table] ?? 0
    counters[table] = idx + 1
    const value = responses[table]?.[idx] ?? null
    const resolved = { data: value, error: null }

    const filters: unknown[] = []
    const chain: Record<string, unknown> = {}
    const returnThis = () => chain
    chain.select = vi.fn(returnThis)
    chain.eq = vi.fn((...args: unknown[]) => {
      filters.push(['eq', ...args])
      return chain
    })
    chain.in = vi.fn(returnThis)
    chain.is = vi.fn((...args: unknown[]) => {
      filters.push(['is', ...args])
      return chain
    })
    chain.not = vi.fn(returnThis)
    chain.limit = vi.fn(returnThis)
    chain.order = vi.fn(returnThis)
    chain.update = vi.fn((payload: unknown) => {
      updates.push({ table, payload, filters })
      return chain
    })
    chain.single = vi.fn().mockResolvedValue(resolved)
    chain.maybeSingle = vi.fn().mockResolvedValue(resolved)
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resolved).then(res)
    return chain
  }

  return {
    from: vi.fn((table: string) => chainFor(table)),
    _updates: updates,
  }
}

const membershipRow = { workspace_id: 'ws-1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WHATSAPP_WORKER_URL', 'http://worker.test')
  vi.stubEnv('CRON_SECRET', 'test-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ── saveAlertDestination ─────────────────────────────────────────────────────

describe('saveAlertDestination', () => {
  it('rejeita número individual inválido antes de qualquer acesso ao banco', async () => {
    const result = await saveAlertDestination('acc-1', 'client-1', {
      destination_type: 'individual',
      destination_id: '123',
    })
    expect(result).toEqual({
      error: 'Número individual inválido — use formato E.164 (ex: 5511999998888)',
    })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('rejeita JID de grupo inválido antes de qualquer acesso ao banco', async () => {
    const result = await saveAlertDestination('acc-1', 'client-1', {
      destination_type: 'group',
      destination_id: 'grupo-sem-formato',
    })
    expect(result).toEqual({
      error: 'JID de grupo inválido — use formato XXXXXXXXXX@g.us',
    })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('aceita número individual com + e espaços (normaliza antes de validar)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      whatsapp_accounts: [null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await saveAlertDestination('acc-1', 'client-1', {
      destination_type: 'individual',
      destination_id: '+55 11 99999 8888',
    })
    expect(result).toEqual({ success: true })
  })

  it('salva destino de grupo com filtros de id + workspace (IDOR)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      whatsapp_accounts: [null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await saveAlertDestination('acc-1', 'client-1', {
      destination_type: 'group',
      destination_id: '120363000@g.us',
    })

    expect(result).toEqual({ success: true })
    const update = service._updates.find(u => u.table === 'whatsapp_accounts')
    expect(update?.payload).toEqual({
      alert_destination_type: 'group',
      alert_destination_id: '120363000@g.us',
    })
    expect(update?.filters).toContainEqual(['eq', 'id', 'acc-1'])
    expect(update?.filters).toContainEqual(['eq', 'workspace_id', 'ws-1'])
  })

  it('retorna erro quando não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    const result = await saveAlertDestination('acc-1', 'client-1', {
      destination_type: 'individual',
      destination_id: '5511999998888',
    })
    expect(result).toEqual({ error: 'Não autenticado' })
  })
})

// ── Cron GET /api/cron/send-alerts ───────────────────────────────────────────

const baseAlert = {
  id: 'alert-1',
  workspace_id: 'ws-1',
  ad_account_id: 'ad-1',
  alert_type: 'low_balance',
  threshold_days: 7,
  projected_days: 3.4,
  ad_accounts: { account_name: 'Conta Meta Cliente X' },
}

const waConnected = {
  workspace_id: 'ws-1',
  account_id: '5511999998888',
  alert_destination_type: 'group',
  alert_destination_id: '120363000@g.us',
}

describe('cron send-alerts', () => {
  function makeRequest(auth?: string) {
    return new NextRequest('http://localhost/api/cron/send-alerts', {
      headers: auth ? { Authorization: auth } : {},
    })
  }

  it('retorna 401 sem Authorization correto', async () => {
    const res = await cronSendAlerts(makeRequest('Bearer errado'))
    expect(res.status).toBe(401)
  })

  it('retorna processed 0 quando não há alertas pendentes', async () => {
    const service = makeServiceClientByTable({ alerts: [[]] })
    mockCreateServiceClient.mockReturnValue(service as never)

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    expect(await res.json()).toEqual({ processed: 0 })
  })

  it('claim ok + worker ok → sent, whatsapp_last_error limpo', async () => {
    const service = makeServiceClientByTable({
      alerts: [[baseAlert], { id: 'alert-1' }, null], // select, claim, limpeza de erro
      whatsapp_accounts: [[waConnected]],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 1, skipped: 0, failed: 0 })

    // Claim atômico veio ANTES do worker call, com filtro whatsapp_sent_at IS NULL
    const claim = service._updates[0]
    expect(claim.table).toBe('alerts')
    expect(claim.payload).toMatchObject({ whatsapp_destination_id: '120363000@g.us' })
    expect(claim.filters).toContainEqual(['is', 'whatsapp_sent_at', null])

    // Mensagem formatada (AC 3.6.8)
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(sentBody.to).toBe('120363000@g.us')
    expect(sentBody.text).toContain('⚠️ Alerta de Saldo — Conta Meta Cliente X')
    expect(sentBody.text).toContain('esgotar em 3 dias')
    expect(sentBody.text).toContain('Limite configurado: 7 dias')

    // Limpeza de last_error após sucesso
    const cleanup = service._updates[1]
    expect(cleanup.payload).toEqual({ whatsapp_last_error: null })
  })

  it('claim ok + worker falha → rollback do claim + last_error', async () => {
    const service = makeServiceClientByTable({
      alerts: [[baseAlert], { id: 'alert-1' }, null], // select, claim, rollback
      whatsapp_accounts: [[waConnected]],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'sem socket ativo' }))

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 0, failed: 1 })
    const rollback = service._updates[1]
    expect(rollback.table).toBe('alerts')
    expect(rollback.payload).toEqual({
      whatsapp_sent_at: null,
      whatsapp_last_error: 'sem socket ativo',
    })
  })

  it('claim perdido (outro processo enviou) → skip sem chamar worker', async () => {
    const service = makeServiceClientByTable({
      alerts: [[baseAlert], null], // select, claim retorna vazio
      whatsapp_accounts: [[waConnected]],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 1, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('workspace sem conta conectada ou sem destino → skip silencioso (AC 3.6.5)', async () => {
    const service = makeServiceClientByTable({
      alerts: [[baseAlert]],
      whatsapp_accounts: [[]], // filtro status+destino não retornou contas
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 1, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    // Nenhum claim deve ter acontecido
    expect(service._updates).toHaveLength(0)
  })

  it('worker inacessível (fetch lança) → rollback com worker inacessível', async () => {
    const service = makeServiceClientByTable({
      alerts: [[baseAlert], { id: 'alert-1' }, null],
      whatsapp_accounts: [[waConnected]],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await cronSendAlerts(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, failed: 1 })
    const rollback = service._updates[1]
    expect(rollback.payload).toMatchObject({
      whatsapp_sent_at: null,
      whatsapp_last_error: 'worker inacessível',
    })
  })
})
