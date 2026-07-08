import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  createSupabaseBrowserClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { GET as clienteMetrics } from '@/app/api/cliente/metrics/route'
import { inviteClientUser } from '@/app/actions/client-users'
import { isClienteSessionExpired } from '@/proxy'
import { NextRequest } from 'next/server'

const mockCreateServerClient = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLIENT_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const CLIENT_B = 'bbbbbbbb-0000-0000-0000-000000000002'

/**
 * Sessão de um usuário-cliente. Fix BLOCK-003: o claim vem de getClaims()
 * (JWT verificado) — o user_metadata de getUser() fica VAZIO de propósito,
 * espelhando a realidade (hook só escreve no token, não no banco).
 */
function makeClienteSession(clientId: string | null, extra: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-cliente-1',
            user_metadata: {}, // banco NÃO tem o claim — fonte correta é o JWT
            ...extra,
          },
        },
      }),
      getClaims: vi.fn().mockResolvedValue({
        data: clientId ? { claims: { user_metadata: { client_id: clientId } } } : { claims: { user_metadata: {} } },
      }),
    },
    from: vi.fn(), // guard 403 deve barrar ANTES de qualquer query
  }
}

function makeAnonSession() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getClaims: vi.fn().mockResolvedValue({ data: null }),
    },
    from: vi.fn(),
  }
}

function metricsRequest(clientId: string | null, period = 30) {
  const url = new URL('http://localhost/api/cliente/metrics')
  if (clientId) url.searchParams.set('client_id', clientId)
  url.searchParams.set('period', String(period))
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── AC 3.8.2 — 403 cross-client EXPLÍCITO ────────────────────────────────────

describe('GET /api/cliente/metrics — isolamento por client_id (AC 3.8.2)', () => {
  it('🔒 CROSS-CLIENT: sessão do cliente A pedindo dados do cliente B → 403, sem NENHUMA query', async () => {
    const session = makeClienteSession(CLIENT_A)
    mockCreateServerClient.mockResolvedValue(session as never)

    const res = await clienteMetrics(metricsRequest(CLIENT_B))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Acesso negado' })
    // O guard barra ANTES de qualquer acesso a dados — nem uma query executa
    expect(session.from).not.toHaveBeenCalled()
  })

  it('sem sessão → 401', async () => {
    mockCreateServerClient.mockResolvedValue(makeAnonSession() as never)
    const res = await clienteMetrics(metricsRequest(CLIENT_A))
    expect(res.status).toBe(401)
  })

  it('sessão SEM claim client_id (gestor) → 403, sem query', async () => {
    const session = makeClienteSession(null)
    mockCreateServerClient.mockResolvedValue(session as never)

    const res = await clienteMetrics(metricsRequest(CLIENT_A))

    expect(res.status).toBe(403)
    expect(session.from).not.toHaveBeenCalled()
  })

  it('sem client_id na query string → 403 (nunca assume o claim como default)', async () => {
    const session = makeClienteSession(CLIENT_A)
    mockCreateServerClient.mockResolvedValue(session as never)

    const res = await clienteMetrics(metricsRequest(null))
    expect(res.status).toBe(403)
  })

  it('claim correto → 200 com contas agregadas', async () => {
    const session = makeClienteSession(CLIENT_A)
    // from() encadeável por tabela
    const tables: Record<string, unknown> = {
      ad_accounts: [{ id: 'acc-1', account_name: 'Conta Meta', platform: 'meta' }],
      ad_campaigns: [{ id: 'camp-1', ad_account_id: 'acc-1' }],
      campaign_metrics: [
        { campaign_id: 'camp-1', spend: 100, impressions: 1000, clicks: 50, conversions: 5, revenue: 300 },
      ],
    }
    session.from = vi.fn((table: string) => {
      const resolved = { data: tables[table] ?? [], error: null }
      const chain: Record<string, unknown> = {}
      const returnThis = () => chain
      chain.select = vi.fn(returnThis)
      chain.eq = vi.fn(returnThis)
      chain.in = vi.fn(returnThis)
      chain.gte = vi.fn(returnThis)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resolved).then(res)
      return chain
    }) as never
    mockCreateServerClient.mockResolvedValue(session as never)

    const res = await clienteMetrics(metricsRequest(CLIENT_A))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0]).toMatchObject({
      account_id: 'acc-1',
      health: 'green', // revenue/spend = 3 >= 1
      totals: { spend: 100, conversions: 5, revenue: 300 },
    })
  })

  it('período inválido cai no default 30 (sem erro)', async () => {
    const session = makeClienteSession(CLIENT_A)
    session.from = vi.fn(() => {
      const chain: Record<string, unknown> = {}
      const returnThis = () => chain
      chain.select = vi.fn(returnThis)
      chain.eq = vi.fn(returnThis)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return chain
    }) as never
    mockCreateServerClient.mockResolvedValue(session as never)

    const res = await clienteMetrics(metricsRequest(CLIENT_A, 999))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.period).toBe(30)
  })
})

// ── inviteClientUser (AC 3.8.1) ──────────────────────────────────────────────

describe('inviteClientUser', () => {
  it('rejeita email inválido antes de qualquer acesso ao banco', async () => {
    const result = await inviteClientUser('client-1', 'nao-e-email')
    expect(result).toEqual({ error: 'Email inválido' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('retorna erro quando não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeAnonSession() as never)
    const result = await inviteClientUser('client-1', 'cliente@empresa.com')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('retorna erro quando o cliente não pertence ao workspace (IDOR)', async () => {
    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'gestor-1' } } }) },
    } as never)

    const responses: Record<string, unknown> = {
      workspace_members: { workspace_id: 'ws-1' },
      clients: null, // filtro workspace não encontrou
    }
    const service = {
      from: vi.fn((table: string) => {
        const resolved = { data: responses[table] ?? null, error: null }
        const chain: Record<string, unknown> = {}
        const returnThis = () => chain
        chain.select = vi.fn(returnThis)
        chain.eq = vi.fn(returnThis)
        chain.is = vi.fn(returnThis)
        chain.limit = vi.fn(returnThis)
        chain.single = vi.fn().mockResolvedValue(resolved)
        chain.maybeSingle = vi.fn().mockResolvedValue(resolved)
        return chain
      }),
      auth: { admin: { inviteUserByEmail: vi.fn() } },
    }
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await inviteClientUser('client-de-outro-ws', 'cliente@empresa.com')

    expect(result).toEqual({ error: 'Cliente não encontrado' })
    expect(service.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('convida com sucesso e registra em client_users', async () => {
    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'gestor-1' } } }) },
    } as never)

    const inserted: unknown[] = []
    const responses: Record<string, unknown> = {
      workspace_members: { workspace_id: 'ws-1' },
      clients: { id: 'client-1' },
    }
    const service = {
      from: vi.fn((table: string) => {
        const resolved = { data: responses[table] ?? null, error: null }
        const chain: Record<string, unknown> = {}
        const returnThis = () => chain
        chain.select = vi.fn(returnThis)
        chain.eq = vi.fn(returnThis)
        chain.is = vi.fn(returnThis)
        chain.limit = vi.fn(returnThis)
        chain.single = vi.fn().mockResolvedValue(resolved)
        chain.maybeSingle = vi.fn().mockResolvedValue(resolved)
        chain.insert = vi.fn((row: unknown) => {
          inserted.push({ table, row })
          return Promise.resolve({ error: null })
        })
        return chain
      }),
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: { id: 'novo-user-id' } },
            error: null,
          }),
        },
      },
    }
    mockCreateServiceClient.mockReturnValue(service as never)

    const result = await inviteClientUser('client-1', '  Cliente@Empresa.COM ')

    expect(result).toEqual({ success: true })
    // email normalizado (trim + lowercase) no convite e no insert
    expect(service.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'cliente@empresa.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/cliente/definir-senha') })
    )
    expect(inserted[0]).toMatchObject({
      table: 'client_users',
      row: {
        workspace_id: 'ws-1',
        client_id: 'client-1',
        user_id: 'novo-user-id',
        email: 'cliente@empresa.com',
      },
    })
  })
})

// ── AC 3.8.6 — expiração de 7 dias ───────────────────────────────────────────

describe('isClienteSessionExpired', () => {
  const now = new Date('2026-07-08T12:00:00Z')

  it('sessão de 6 dias → não expirada', () => {
    expect(isClienteSessionExpired('2026-07-02T12:00:00Z', now)).toBe(false)
  })

  it('sessão de exatamente 7 dias → não expirada (limite inclusivo)', () => {
    expect(isClienteSessionExpired('2026-07-01T12:00:00Z', now)).toBe(false)
  })

  it('sessão de 7 dias e 1 minuto → expirada', () => {
    expect(isClienteSessionExpired('2026-07-01T11:59:00Z', now)).toBe(true)
  })

  it('last_sign_in_at ausente → expirada (fail-closed)', () => {
    expect(isClienteSessionExpired(null, now)).toBe(true)
    expect(isClienteSessionExpired(undefined, now)).toBe(true)
  })
})
