import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Testes unitários — GET /api/oauth/google/callback (Story 2.2 — AC 2.2.10)
 *
 * Cobre:
 *  1. state mismatch → 400 (CSRF guard) + cookie deletado
 *  2. TOKEN_ENCRYPTION_KEY ausente → 500
 *  3. upsert com AMBOS os tokens REALMENTE criptografados (não texto puro) e
 *     onConflict no triplo único (atualiza conta Google existente)
 *
 * NÃO mockamos encryptToken — usamos a implementação real de @advezo/utils,
 * conforme requisito da story (tokens devem ser de fato criptografados — AC 2.2.4).
 */

// ── Mocks de infraestrutura (cookies + supabase) ─────────────────────────────

const cookieState = { value: undefined as string | undefined, deleted: false }

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'oauth_state_google' && cookieState.value !== undefined
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
      // getUser: só checagem de sessão. Fix TD-005: workspace_id via getClaims() (JWT).
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

function makeRequest(state: string | null, code: string | null = 'auth-code'): Request {
  const url = new URL('http://localhost:3000/api/oauth/google/callback')
  if (state !== null) url.searchParams.set('state', state)
  if (code !== null) url.searchParams.set('code', code)
  return new Request(url.toString())
}

describe('GET /api/oauth/google/callback', () => {
  beforeEach(() => {
    cookieState.value = undefined
    cookieState.deleted = false
    upsertSpy.mockClear()
    process.env.GOOGLE_CLIENT_ID = 'google-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/oauth/google/callback'
    process.env.GOOGLE_ADS_TEST_CUSTOMER_ID = '1234567890' // sandbox mode
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retorna 400 quando o state não bate com o cookie (CSRF guard)', async () => {
    cookieState.value = 'expected-state'
    const { GET } = await import('@/app/api/oauth/google/callback/route')

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
    const { GET } = await import('@/app/api/oauth/google/callback/route')

    const res = await GET(makeRequest('match'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Encryption key not configured')
  })

  it('retorna 500 quando o env do Google está ausente', async () => {
    cookieState.value = 'match'
    delete process.env.GOOGLE_CLIENT_SECRET
    const { GET } = await import('@/app/api/oauth/google/callback/route')

    const res = await GET(makeRequest('match'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Google OAuth env not configured')
  })

  it('faz upsert com AMBOS os tokens REAIS criptografados e onConflict no triplo único', async () => {
    cookieState.value = 'match'

    // Mock do token endpoint do Google: retorna access_token + refresh_token.
    const fetchMock = vi.fn(async (input: string | URL) => {
      const u = String(input)
      if (u.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'google-access-tok',
            refresh_token: 'google-refresh-tok',
            expires_in: 3600,
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${u}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/oauth/google/callback/route')
    const res = await GET(makeRequest('match'))

    // Sucesso → redirect para integrations com platform=google
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/settings/integrations?status=success')
    expect(location).toContain('platform=google')

    // Upsert chamado com onConflict no triplo único (sandbox usa GOOGLE_ADS_TEST_CUSTOMER_ID)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const callArgs = upsertSpy.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ]
    const [rows, options] = callArgs
    expect(options.onConflict).toBe('workspace_id,platform,external_account_id')
    expect(rows[0].platform).toBe('google')
    expect(rows[0].external_account_id).toBe('1234567890')
    expect(rows[0].workspace_id).toBe('ws-123')

    // AC 2.2.4 — AMBOS os tokens criptografados (formato iv:tag:ciphertext), nunca texto puro.
    const encryptedToken = rows[0].encrypted_token as string
    const encryptedRefreshToken = rows[0].encrypted_refresh_token as string

    expect(encryptedToken).not.toBe('google-access-tok')
    expect(encryptedToken.split(':')).toHaveLength(3)

    expect(encryptedRefreshToken).not.toBe('google-refresh-tok')
    expect(encryptedRefreshToken.split(':')).toHaveLength(3)
  })

  it('redireciona com erro quando o Google não retorna refresh_token', async () => {
    cookieState.value = 'match'

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'only-access', expires_in: 3600 }),
    }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/oauth/google/callback/route')
    const res = await GET(makeRequest('match'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('error=google_oauth_failed')
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})
