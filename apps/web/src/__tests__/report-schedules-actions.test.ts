import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import {
  saveReportSchedule,
  toggleReportSchedule,
  previewReport,
  type ReportScheduleInput,
} from '@/app/actions/report-schedules'

const mockCreateServerClient  = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)
const mockGenerateReport      = vi.mocked(generateReport)

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServerClient(userId: string | null = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  }
}

function makeServiceClient({
  membership = { workspace_id: 'ws-1' } as { workspace_id: string } | null,
  dbError = null as string | null,
} = {}) {
  const resolvedMembership = { data: membership, error: null }
  const resolvedDb = { data: null, error: dbError ? { message: dbError } : null }

  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedMembership),
  }

  const dbChain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue(resolvedDb),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedDb),
    then:   (res: (v: unknown) => unknown) => Promise.resolve(resolvedDb).then(res),
  }

  let callCount = 0
  return {
    from: vi.fn().mockImplementation(() => (callCount++ === 0 ? membershipChain : dbChain)),
    _dbChain: dbChain,
  }
}

const validIndividual: ReportScheduleInput = {
  frequency: 'weekly',
  send_day: 1,
  send_time: '09:00',
  destination_type: 'individual',
  destination_id: '5511999998888',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── saveReportSchedule ─────────────────────────────────────────────────────────

describe('saveReportSchedule', () => {
  it('rejeita número individual inválido antes de qualquer acesso ao banco', async () => {
    const result = await saveReportSchedule('client-1', {
      ...validIndividual,
      destination_id: '123',
    })
    expect(result).toEqual({
      error: 'Número individual inválido — use formato E.164 (ex: 5511999998888)',
    })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('aceita número individual com + e espaços (normaliza antes de validar)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await saveReportSchedule('client-1', {
      ...validIndividual,
      destination_id: '+55 11 99999 8888',
    })

    expect(result).toEqual({ success: true })
    expect(_dbChain.upsert).toHaveBeenCalled()
  })

  it('rejeita JID de grupo inválido', async () => {
    const result = await saveReportSchedule('client-1', {
      ...validIndividual,
      destination_type: 'group',
      destination_id: 'not-a-group',
    })
    expect(result).toEqual({
      error: 'JID de grupo inválido — use formato XXXXXXXXXX@g.us',
    })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('aceita JID de grupo válido', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await saveReportSchedule('client-1', {
      ...validIndividual,
      destination_type: 'group',
      destination_id: '120363123456789@g.us',
    })

    expect(result).toEqual({ success: true })
    expect(_dbChain.upsert).toHaveBeenCalled()
  })

  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await saveReportSchedule('client-1', validIndividual)
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('faz upsert com onConflict workspace_id,client_id e campos corretos', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await saveReportSchedule('client-1', validIndividual)

    expect(result).toEqual({ success: true })
    expect(_dbChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        client_id: 'client-1',
        frequency: 'weekly',
        send_day: 1,
        send_time: '09:00',
        destination_type: 'individual',
        destination_id: '5511999998888',
      }),
      { onConflict: 'workspace_id,client_id' }
    )
  })

  it('força send_day null para frequência daily', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    await saveReportSchedule('client-1', {
      ...validIndividual,
      frequency: 'daily',
      send_day: null,
    })

    expect(_dbChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'daily', send_day: null }),
      { onConflict: 'workspace_id,client_id' }
    )
  })

  it('retorna erro se o upsert falha', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient({ dbError: 'DB error' })
    _dbChain.upsert.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await saveReportSchedule('client-1', validIndividual)
    expect(result).toEqual({ error: 'Erro ao salvar configuração' })
  })
})

// ── toggleReportSchedule ───────────────────────────────────────────────────────

describe('toggleReportSchedule', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await toggleReportSchedule('sched-1', 'client-1', false)
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('atualiza is_active para false e filtra por id + workspace', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await toggleReportSchedule('sched-1', 'client-1', false)

    expect(result).toEqual({ success: true })
    expect(_dbChain.update).toHaveBeenCalledWith({ is_active: false })
    expect(_dbChain.eq).toHaveBeenCalledWith('id', 'sched-1')
    expect(_dbChain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })

  it('atualiza is_active para true', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await toggleReportSchedule('sched-1', 'client-1', true)

    expect(result).toEqual({ success: true })
    expect(_dbChain.update).toHaveBeenCalledWith({ is_active: true })
  })

  it('retorna erro se o update falha', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    _dbChain.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'DB error' } }).then(res)
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await toggleReportSchedule('sched-1', 'client-1', false)
    expect(result).toEqual({ error: 'Erro ao atualizar status' })
  })
})

// ── previewReport ──────────────────────────────────────────────────────────────

describe('previewReport', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await previewReport('client-1')
    expect(result).toEqual({ error: 'Não autenticado' })
    expect(mockGenerateReport).not.toHaveBeenCalled()
  })

  it('chama generateReport com workspaceId, clientId e período de 30 dias', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)
    mockGenerateReport.mockResolvedValue('📊 Relatório de teste')

    const result = await previewReport('client-1')

    expect(result).toEqual({ text: '📊 Relatório de teste' })
    expect(mockGenerateReport).toHaveBeenCalledTimes(1)

    const [wsId, clientId, period] = mockGenerateReport.mock.calls[0]
    expect(wsId).toBe('ws-1')
    expect(clientId).toBe('client-1')

    const diffDays = Math.round(
      (period.to.getTime() - period.from.getTime()) / (1000 * 60 * 60 * 24)
    )
    expect(diffDays).toBe(30)
  })

  it('retorna erro se generateReport lança', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from } = makeServiceClient()
    mockCreateServiceClient.mockReturnValue({ from } as never)
    mockGenerateReport.mockRejectedValue(new Error('boom'))

    const result = await previewReport('client-1')
    expect(result).toEqual({ error: 'Erro ao gerar pré-visualização' })
  })
})
