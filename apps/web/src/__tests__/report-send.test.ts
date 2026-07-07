import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/report-generator', () => ({
  generateReport: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { generateReport } from '@/lib/whatsapp/report-generator'
import { scheduleShouldFireNow, computePeriod } from '@/lib/reports/schedule-utils'
import { resendReport, sendNow } from '@/app/actions/report-send'
import { GET as cronSendReports } from '@/app/api/cron/send-reports/route'
import { NextRequest } from 'next/server'

const mockCreateServerClient = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)
const mockGenerateReport = vi.mocked(generateReport)

// ── scheduleShouldFireNow ────────────────────────────────────────────────────

describe('scheduleShouldFireNow', () => {
  // 2026-07-08 é uma quarta-feira (getUTCDay() === 3)
  const wed9h = new Date('2026-07-08T09:00:00Z')

  it('daily dispara na hora exata do send_time', () => {
    expect(scheduleShouldFireNow({ frequency: 'daily', send_day: null, send_time: '09:00:00' }, wed9h)).toBe(true)
  })

  it('daily não dispara em hora errada', () => {
    expect(scheduleShouldFireNow({ frequency: 'daily', send_day: null, send_time: '10:00:00' }, wed9h)).toBe(false)
  })

  it('weekly dispara no dia da semana + hora corretos', () => {
    expect(scheduleShouldFireNow({ frequency: 'weekly', send_day: 3, send_time: '09:00' }, wed9h)).toBe(true)
  })

  it('weekly não dispara em dia da semana errado', () => {
    expect(scheduleShouldFireNow({ frequency: 'weekly', send_day: 1, send_time: '09:00' }, wed9h)).toBe(false)
  })

  it('monthly dispara no dia do mês + hora corretos', () => {
    expect(scheduleShouldFireNow({ frequency: 'monthly', send_day: 8, send_time: '09:00' }, wed9h)).toBe(true)
  })

  it('monthly não dispara em dia do mês errado', () => {
    expect(scheduleShouldFireNow({ frequency: 'monthly', send_day: 15, send_time: '09:00' }, wed9h)).toBe(false)
  })

  it('biweekly só dispara no dia certo (paridade de semana estável)', () => {
    const fire = scheduleShouldFireNow({ frequency: 'biweekly', send_day: 3, send_time: '09:00' }, wed9h)
    const fireNextWeek = scheduleShouldFireNow(
      { frequency: 'biweekly', send_day: 3, send_time: '09:00' },
      new Date('2026-07-15T09:00:00Z')
    )
    // Semanas consecutivas têm paridade oposta — exatamente uma delas dispara
    expect(fire).not.toBe(fireNextWeek)
  })

  it('frequência desconhecida não dispara', () => {
    expect(scheduleShouldFireNow({ frequency: 'yearly', send_day: null, send_time: '09:00' }, wed9h)).toBe(false)
  })
})

// ── computePeriod ────────────────────────────────────────────────────────────

describe('computePeriod', () => {
  const wed = new Date('2026-07-08T09:00:00Z')

  it('daily: período é o próprio dia', () => {
    expect(computePeriod('daily', wed)).toEqual({ period_start: '2026-07-08', period_end: '2026-07-08' })
  })

  it('weekly: período começa na segunda-feira da semana', () => {
    expect(computePeriod('weekly', wed)).toEqual({ period_start: '2026-07-06', period_end: '2026-07-08' })
  })

  it('monthly: período começa no dia 1 do mês', () => {
    expect(computePeriod('monthly', wed)).toEqual({ period_start: '2026-07-01', period_end: '2026-07-08' })
  })

  it('biweekly: período começa na segunda de uma semana par (7 ou 14 dias atrás)', () => {
    const { period_start, period_end } = computePeriod('biweekly', wed)
    expect(period_end).toBe('2026-07-08')
    expect(['2026-07-06', '2026-06-29']).toContain(period_start)
  })

  it('frequência desconhecida lança erro', () => {
    expect(() => computePeriod('yearly', wed)).toThrow('Frequência desconhecida')
  })
})

// ── Helpers de mock (padrão de report-schedules-actions.test.ts) ─────────────

function makeServerClient(userId: string | null = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  }
}

interface TableResponses {
  [table: string]: unknown[]
}

/** Service client cujo from(table) devolve respostas em fila por tabela. */
function makeServiceClientByTable(responses: TableResponses) {
  const counters: Record<string, number> = {}
  const updates: Array<{ table: string; payload: unknown }> = []

  function chainFor(table: string) {
    const idx = counters[table] ?? 0
    counters[table] = idx + 1
    const value = responses[table]?.[idx] ?? null
    const resolved = { data: value, error: null }

    const chain: Record<string, unknown> = {}
    const returnThis = () => chain
    chain.select = vi.fn(returnThis)
    chain.eq = vi.fn(returnThis)
    chain.in = vi.fn(returnThis)
    chain.is = vi.fn(returnThis)
    chain.not = vi.fn(returnThis)
    chain.limit = vi.fn(returnThis)
    chain.order = vi.fn(returnThis)
    chain.upsert = vi.fn(returnThis)
    chain.update = vi.fn((payload: unknown) => {
      updates.push({ table, payload })
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

// ── resendReport ─────────────────────────────────────────────────────────────

describe('resendReport', () => {
  it('retorna erro quando não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    const result = await resendReport('log-1', 'client-1')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('retorna erro quando log não pertence ao workspace (IDOR)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_logs: [null], // filtro workspace_id não encontrou
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await resendReport('log-de-outro-ws', 'client-1')
    expect(result).toEqual({ error: 'Registro de envio não encontrado' })
  })

  it('reenvia com sucesso e marca sent', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const log = {
      id: 'log-1', workspace_id: 'ws-1', client_id: 'client-1', schedule_id: 'sch-1',
      period_start: '2026-07-01', period_end: '2026-07-07',
      destination_type: 'group', destination_id: '120363000@g.us',
    }
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_logs: [log, null], // select, depois update
      whatsapp_accounts: [{ account_id: '5511999998888' }],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('relatório texto')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const result = await resendReport('log-1', 'client-1')

    expect(result).toEqual({ success: true })
    expect(fetch).toHaveBeenCalledWith(
      'http://worker.test/send',
      expect.objectContaining({
        body: JSON.stringify({
          workspace_id: 'ws-1',
          account_id: '5511999998888',
          to: '120363000@g.us',
          text: 'relatório texto',
        }),
      })
    )
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'sent', error_message: null })
  })

  it('marca failed quando worker responde erro', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const log = {
      id: 'log-1', workspace_id: 'ws-1', client_id: 'client-1', schedule_id: 'sch-1',
      period_start: '2026-07-01', period_end: '2026-07-07',
      destination_type: 'individual', destination_id: '5511888887777',
    }
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_logs: [log, null],
      whatsapp_accounts: [{ account_id: '5511999998888' }],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('texto')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'sem socket ativo' }))

    const result = await resendReport('log-1', 'client-1')

    expect(result).toEqual({ error: 'Falha no envio: sem socket ativo' })
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'failed', error_message: 'sem socket ativo' })
  })

  it('retorna erro quando não há conta WhatsApp conectada', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const log = {
      id: 'log-1', workspace_id: 'ws-1', client_id: 'client-1', schedule_id: 'sch-1',
      period_start: '2026-07-01', period_end: '2026-07-07',
      destination_type: 'individual', destination_id: '5511888887777',
    }
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_logs: [log],
      whatsapp_accounts: [null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await resendReport('log-1', 'client-1')
    expect(result).toEqual({ error: 'Nenhuma conta WhatsApp conectada' })
  })
})

// ── sendNow ──────────────────────────────────────────────────────────────────

describe('sendNow', () => {
  const schedule = {
    id: 'sch-1', workspace_id: 'ws-1', client_id: 'client-1',
    destination_type: 'group', destination_id: '120363000@g.us',
  }

  it('retorna erro quando schedule não pertence ao workspace (IDOR)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_schedules: [null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await sendNow('sch-de-outro-ws', 'client-1')
    expect(result).toEqual({ error: 'Configuração de envio não encontrada' })
  })

  it('envia com período dos últimos 30 dias e marca sent', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_schedules: [schedule],
      whatsapp_accounts: [{ account_id: '5511999998888' }],
      report_logs: [{ id: 'log-novo' }, null], // upsert, depois update
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('texto 30d')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const result = await sendNow('sch-1', 'client-1')

    expect(result).toEqual({ success: true })
    const [, , period] = mockGenerateReport.mock.calls[0]
    const diffDays = Math.round((period.to.getTime() - period.from.getTime()) / 86400000)
    expect(diffDays).toBe(30)
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'sent' })
  })

  it('marca failed quando worker está inacessível', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const service = makeServiceClientByTable({
      workspace_members: [membershipRow],
      report_schedules: [schedule],
      whatsapp_accounts: [{ account_id: '5511999998888' }],
      report_logs: [{ id: 'log-novo' }, null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('texto')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await sendNow('sch-1', 'client-1')

    expect(result).toEqual({ error: 'Falha no envio: worker inacessível' })
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'failed', error_message: 'worker inacessível' })
  })
})

// ── Cron GET /api/cron/send-reports ──────────────────────────────────────────

describe('cron send-reports', () => {
  function makeRequest(auth?: string) {
    return new NextRequest('http://localhost/api/cron/send-reports', {
      headers: auth ? { Authorization: auth } : {},
    })
  }

  it('retorna 401 sem Authorization correto', async () => {
    const res = await cronSendReports(makeRequest('Bearer errado'))
    expect(res.status).toBe(401)
  })

  it('retorna processed 0 quando não há schedules ativos', async () => {
    const service = makeServiceClientByTable({ report_schedules: [[]] })
    mockCreateServiceClient.mockReturnValue(service as never)

    const res = await cronSendReports(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processed: 0 })
  })

  it('pula schedule quando dedup detecta período já processado (upsert sem retorno)', async () => {
    const nowHour = new Date().getUTCHours().toString().padStart(2, '0')
    const service = makeServiceClientByTable({
      report_schedules: [[{
        id: 'sch-1', workspace_id: 'ws-1', client_id: 'client-1',
        frequency: 'daily', send_day: null, send_time: `${nowHour}:00`,
        destination_type: 'individual', destination_id: '5511888887777',
      }]],
      whatsapp_accounts: [[{ workspace_id: 'ws-1', account_id: '5511999998888' }]],
      report_logs: [null], // conflito — upsert com ignoreDuplicates não retorna linha
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await cronSendReports(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 1, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockGenerateReport).not.toHaveBeenCalled()
  })

  it('envia, marca sent e contabiliza quando tudo dá certo', async () => {
    const nowHour = new Date().getUTCHours().toString().padStart(2, '0')
    const service = makeServiceClientByTable({
      report_schedules: [[{
        id: 'sch-1', workspace_id: 'ws-1', client_id: 'client-1',
        frequency: 'daily', send_day: null, send_time: `${nowHour}:00`,
        destination_type: 'group', destination_id: '120363000@g.us',
      }]],
      whatsapp_accounts: [[{ workspace_id: 'ws-1', account_id: '5511999998888' }]],
      report_logs: [{ id: 'log-1' }, null], // upsert retorna linha, depois update
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('relatório')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const res = await cronSendReports(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 1, skipped: 0, failed: 0 })
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'sent' })
  })

  it('marca failed e contabiliza quando o worker falha', async () => {
    const nowHour = new Date().getUTCHours().toString().padStart(2, '0')
    const service = makeServiceClientByTable({
      report_schedules: [[{
        id: 'sch-1', workspace_id: 'ws-1', client_id: 'client-1',
        frequency: 'daily', send_day: null, send_time: `${nowHour}:00`,
        destination_type: 'individual', destination_id: '5511888887777',
      }]],
      whatsapp_accounts: [[{ workspace_id: 'ws-1', account_id: '5511999998888' }]],
      report_logs: [{ id: 'log-1' }, null],
    })
    mockCreateServiceClient.mockReturnValue(service as never)
    mockGenerateReport.mockResolvedValue('relatório')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'sem socket ativo' }))

    const res = await cronSendReports(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 0, failed: 1 })
    const update = service._updates.find(u => u.table === 'report_logs')
    expect(update?.payload).toMatchObject({ status: 'failed', error_message: 'sem socket ativo' })
  })

  it('pula schedule de workspace sem conta WhatsApp conectada', async () => {
    const nowHour = new Date().getUTCHours().toString().padStart(2, '0')
    const service = makeServiceClientByTable({
      report_schedules: [[{
        id: 'sch-1', workspace_id: 'ws-sem-wa', client_id: 'client-1',
        frequency: 'daily', send_day: null, send_time: `${nowHour}:00`,
        destination_type: 'individual', destination_id: '5511888887777',
      }]],
      whatsapp_accounts: [[]],
    })
    mockCreateServiceClient.mockReturnValue(service as never)

    const res = await cronSendReports(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toMatchObject({ processed: 1, sent: 0, skipped: 1, failed: 0 })
  })
})
