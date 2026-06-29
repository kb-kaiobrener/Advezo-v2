import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Testes unitários — fetchers de saldo real (Story 2.9 — CP5).
 *
 * Cobre a conversão de unidades e a propagação de erro (que o cron transforma em
 * sync_errors). Meta: balance em centavos → BRL. Google: account_budget em micros,
 * saldo = approved - served → BRL. Erros de API PROPAGAM (caller registra a falha).
 */

describe('fetchMetaBalance (CP5)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('converte balance em centavos para BRL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ balance: '12345' }) }))
    )
    const { fetchMetaBalance } = await import('@/lib/alerts/meta-balance')
    expect(await fetchMetaBalance('act_1', 'tok')).toBe(123.45)
  })

  it('propaga erro quando a API responde != 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid account' } }),
      }))
    )
    const { fetchMetaBalance } = await import('@/lib/alerts/meta-balance')
    await expect(fetchMetaBalance('act_1', 'tok')).rejects.toThrow('Invalid account')
  })

  it('não inclui o access_token na mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    )
    const { fetchMetaBalance } = await import('@/lib/alerts/meta-balance')
    await expect(fetchMetaBalance('act_1', 'super-secret-token')).rejects.toThrow(
      /HTTP 500/
    )
    // A mensagem padrão não vaza o token.
    await expect(
      fetchMetaBalance('act_1', 'super-secret-token').catch((e) => e.message)
    ).resolves.not.toContain('super-secret-token')
  })
})

describe('fetchGoogleBalance (CP5)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('saldo = (approved - served) em micros → BRL', async () => {
    // approved 50_000_000 micros (R$50) - served 20_000_000 (R$20) = R$30.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              accountBudget: {
                approvedSpendingLimitMicros: '50000000',
                amountServedMicros: '20000000',
              },
            },
          ],
        }),
      }))
    )
    const { fetchGoogleBalance } = await import('@/lib/alerts/google-balance')
    expect(await fetchGoogleBalance('123-456-7890', 'tok')).toBe(30)
  })

  it('soma o saldo remanescente de múltiplos budgets aprovados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { accountBudget: { approvedSpendingLimitMicros: '10000000', amountServedMicros: '5000000' } },
            { accountBudget: { approvedSpendingLimitMicros: '10000000', amountServedMicros: '0' } },
          ],
        }),
      }))
    )
    const { fetchGoogleBalance } = await import('@/lib/alerts/google-balance')
    // (10-5) + (10-0) = 15 reais.
    expect(await fetchGoogleBalance('123', 'tok')).toBe(15)
  })

  it('saldo negativo (servido > aprovado) vira 0 (esgotado)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { accountBudget: { approvedSpendingLimitMicros: '1000000', amountServedMicros: '5000000' } },
          ],
        }),
      }))
    )
    const { fetchGoogleBalance } = await import('@/lib/alerts/google-balance')
    expect(await fetchGoogleBalance('123', 'tok')).toBe(0)
  })

  it('propaga erro quando a API responde != 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'PERMISSION_DENIED' } }),
      }))
    )
    const { fetchGoogleBalance } = await import('@/lib/alerts/google-balance')
    await expect(fetchGoogleBalance('123', 'tok')).rejects.toThrow('PERMISSION_DENIED')
  })
})
