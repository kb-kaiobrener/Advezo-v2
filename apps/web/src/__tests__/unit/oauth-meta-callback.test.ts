import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Testes unitários — GET /api/oauth/meta/callback (Story 2.1 — AC 2.1.10)
 *
 * Cobre:
 *  1. state mismatch → 400
 *  2. TOKEN_ENCRYPTION_KEY ausente → 500
 *  3. upsert de conta já existente → encrypted_token atualizado com token REAL
 *
 * NÃO mockamos encryptToken — usamos a implementação real de @advezo/utils,
 * conforme requisito da story (token deve ser de fato criptografado).
 */

// ── Mocks de infraestrutura (cookies + supabase) ─────────────────────────────

const cookieState = { value: undefined as string | undefined, deleted: false }

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'oauth_state' && cookieState.value !== undefined
        ? { value: cookieState.value }
        : undefined,
    delete: () => {
      cookieState.deleted = true
    },
  })),
}))

const upsertSpy = vi.fn(async () => ({ error: null }))

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      // getUser: só checagem de sessão (usuário existe). Fix TD-005: o workspace_id
      // vem de getClaims() (JWT), não de user_metadata do banco.
      getUser: async () => ({ data: { user: { id: 'user-1', user_metadata: {} } } }),
      getClaims: async () => ({
        data: { claims: { user_metadata: { workspace_id: 'ws-123' } } },
      }),
    },
    from: () => ({ upsert: upsertSpy }),
  })),
}))

// 64 hex chars = 32 bytes
const VALID_KEY = 'a'.repeat(64)

function makeRequest(state: string | null, code = 'auth-code'): Request {
  const url = new URL('http://localhost:3000/api/oauth/meta/callback')
  if (state !== null) url.searchParams.set('state', state)
  if (code) url.searchParams.set('code', code)
  return new Request(url.toString())
}

describe('GET /api/oauth/meta/callback', () => {
  beforeEach(() => {
    cookieState.value = undefined
    cookieState.deleted = false
    upsertSpy.mockClear()
    process.env.META_APP_ID = 'app-id'
    process.env.META_APP_SECRET = 'app-secret'
    process.env.META_REDIRECT_URI = 'http://localhost:3000/api/oauth/meta/callback'
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retorna 400 quando o state não bate com o cookie (CSRF guard)', async () => {
    cookieState.value = 'expected-state'
    const { GET } = await import('@/app/api/oauth/meta/callback/route')

    const res = await GET(makeRequest('attacker-state'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('State mismatch')
    // Cookie deve ter sido deletado mesmo no caminho de falha.
    expect(cookieState.deleted).toBe(true)
  })

  it('retorna 500 quando TOKEN_ENCRYPTION_KEY está ausente', async () => {
    cookieState.value = 'match'
    delete process.env.TOKEN_ENCRYPTION_KEY
    const { GET } = await import('@/app/api/oauth/meta/callback/route')

    const res = await GET(makeRequest('match'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Encryption key not configured')
  })

  it('faz upsert de conta com token REAL criptografado e atualiza conta existente', async () => {
    cookieState.value = 'match'

    // Mock da Graph API: code→short, short→long, /me/adaccounts
    let call = 0
    const fetchMock = vi.fn(async (input: string | URL) => {
      const u = String(input)
      if (u.includes('/me/adaccounts')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'act_999', name: 'Conta Existente', account_status: 1 }],
          }),
        } as Response
      }
      // primeiro oauth/access_token = short, segundo = long
      call += 1
      return {
        ok: true,
        json: async () => ({ access_token: call === 1 ? 'short-tok' : 'long-lived-tok' }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/oauth/meta/callback/route')
    const res = await GET(makeRequest('match'))

    // Sucesso → redirect para integrations
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/settings/integrations?status=success')

    // Upsert chamado com onConflict no triplo único (atualiza se já existe)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const callArgs = upsertSpy.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ]
    const [rows, options] = callArgs
    expect(options.onConflict).toBe('workspace_id,platform,external_account_id')
    expect(rows[0].external_account_id).toBe('act_999')
    expect(rows[0].workspace_id).toBe('ws-123')

    // Token deve estar criptografado (formato iv:tag:ciphertext), NÃO em texto puro.
    const encrypted = rows[0].encrypted_token as string
    expect(encrypted).not.toBe('long-lived-tok')
    expect(encrypted.split(':')).toHaveLength(3)
  })
})
