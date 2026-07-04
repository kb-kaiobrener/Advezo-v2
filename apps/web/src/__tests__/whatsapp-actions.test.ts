import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import {
  connectWhatsApp,
  confirmWhatsAppConnected,
  disconnectWhatsApp,
} from '@/app/actions/whatsapp'

const mockCreateServerClient  = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServerClient(userId: string | null = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  }
}

function makeServiceClient({
  membership = { workspace_id: 'ws-1' },
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
    from: vi.fn().mockImplementation(() => {
      return callCount++ === 0 ? membershipChain : dbChain
    }),
    _dbChain: dbChain,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── connectWhatsApp ───────────────────────────────────────────────────────────

describe('connectWhatsApp', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await connectWhatsApp('client-1', '5511999998888')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('retorna erro se workspace não encontrado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const serviceClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        limit:  vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
    mockCreateServiceClient.mockReturnValue(serviceClient as never)

    const result = await connectWhatsApp('client-1', '5511999998888')
    expect(result).toEqual({ error: 'Workspace não encontrado' })
  })

  it('faz upsert com status=connecting e retorna workspaceId', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient()
    const mock = { from }
    mockCreateServiceClient.mockReturnValue(mock as never)

    const result = await connectWhatsApp('client-1', '5511999998888')

    expect(result).toEqual({ success: true, workspaceId: 'ws-1' })
    expect(_dbChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'connecting', account_id: '5511999998888' }),
      { onConflict: 'workspace_id,client_id,account_id' }
    )
  })

  it('retorna erro se o upsert falha', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    const { from, _dbChain } = makeServiceClient({ dbError: 'DB error' })
    _dbChain.upsert.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    mockCreateServiceClient.mockReturnValue({ from } as never)

    const result = await connectWhatsApp('client-1', '5511999998888')
    expect(result).toEqual({ error: 'Erro ao salvar conexão' })
  })
})

// ── confirmWhatsAppConnected ──────────────────────────────────────────────────

describe('confirmWhatsAppConnected', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await confirmWhatsAppConnected('client-1', '5511999998888')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('atualiza status=connected e connected_at no banco', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-1' }, error: null }),
    }
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      then:   (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => count++ === 0 ? membershipChain : updateChain),
    } as never)

    const result = await confirmWhatsAppConnected('client-1', '5511999998888')

    expect(result).toEqual({ success: true })
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'connected' })
    )
  })
})

// ── disconnectWhatsApp ────────────────────────────────────────────────────────

describe('disconnectWhatsApp', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await disconnectWhatsApp('client-1', '5511999998888')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('chama worker /disconnect e atualiza banco com status=disconnected', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-1' }, error: null }),
    }
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      then:   (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => count++ === 0 ? membershipChain : updateChain),
    } as never)

    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const result = await disconnectWhatsApp('client-1', '5511999998888')

    expect(result).toEqual({ success: true })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/disconnect'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'disconnected' })
    )

    vi.unstubAllGlobals()
  })

  it('ainda atualiza banco quando worker está offline', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-1' }, error: null }),
    }
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      then:   (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => count++ === 0 ? membershipChain : updateChain),
    } as never)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await disconnectWhatsApp('client-1', '5511999998888')

    expect(result).toEqual({ success: true })
    expect(updateChain.update).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
