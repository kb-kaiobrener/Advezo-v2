import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken, decryptToken } from '@advezo/utils'

/**
 * Testes unitários — refreshGoogleToken (Story 2.2 — AC 2.2.6 / AC 2.2.10)
 *
 * Cobre:
 *  1. mock fetch retorna novo access_token → banco atualizado com encrypted_token
 *     REAL (criptografado, não texto puro) + status='active' + error_message=null
 *  2. fetch falha → conta marcada status='error' com a mensagem; erro relançado
 *
 * NÃO mockamos encrypt/decrypt — usamos a implementação real de @advezo/utils.
 */

// ── Mock do supabase server client ───────────────────────────────────────────

const updateSpy = vi.fn(
  (_payload: Record<string, unknown>) => ({ eq: () => ({ error: null }) })
)

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({ update: updateSpy }),
  })),
}))

const VALID_KEY = 'b'.repeat(64)

describe('refreshGoogleToken', () => {
  beforeEach(() => {
    updateSpy.mockClear()
    updateSpy.mockImplementation(() => ({ eq: () => ({ error: null }) }))
    process.env.GOOGLE_CLIENT_ID = 'google-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renova o access_token e persiste encrypted_token REAL com status active', async () => {
    const encryptedRefresh = encryptToken('original-refresh-token', VALID_KEY)

    const fetchMock = vi.fn(
      async (_url: string | URL, _init: { body: URLSearchParams }) =>
        ({
          ok: true,
          json: async () => ({ access_token: 'brand-new-access-token' }),
        }) as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    const { refreshGoogleToken } = await import('@/lib/oauth/google')
    const newEncrypted = await refreshGoogleToken('acct-1', encryptedRefresh, VALID_KEY)

    // Retorno está criptografado e decifra para o novo access_token.
    expect(newEncrypted).not.toBe('brand-new-access-token')
    expect(newEncrypted.split(':')).toHaveLength(3)
    expect(decryptToken(newEncrypted, VALID_KEY)).toBe('brand-new-access-token')

    // Banco atualizado com encrypted_token (não texto puro), status active e erro limpo.
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.encrypted_token).toBe(newEncrypted)
    expect(payload.status).toBe('active')
    expect(payload.error_message).toBeNull()

    // O refresh_token correto foi enviado ao Google (descriptografado).
    const body = fetchMock.mock.calls[0][1].body
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('original-refresh-token')
  })

  it('marca a conta como error quando o refresh falha e relança o erro', async () => {
    const encryptedRefresh = encryptToken('original-refresh-token', VALID_KEY)

    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const { refreshGoogleToken } = await import('@/lib/oauth/google')

    await expect(
      refreshGoogleToken('acct-1', encryptedRefresh, VALID_KEY)
    ).rejects.toThrow(/refresh failed/i)

    // Última chamada de update deve marcar status='error' com a mensagem.
    expect(updateSpy).toHaveBeenCalled()
    const lastCall = updateSpy.mock.calls[updateSpy.mock.calls.length - 1]
    const payload = lastCall[0]
    expect(payload.status).toBe('error')
    expect(payload.error_message).toMatch(/refresh failed/i)
  })
})
