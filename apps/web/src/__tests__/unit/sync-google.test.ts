import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken } from '@advezo/utils'

/**
 * Testes unitários — Sync Google (Story 2.4 — AC 2.4.10)
 *
 * Cobre os 4 cenários exigidos pela story:
 *  1. Sync bem-sucedido → upsert campaigns + metrics (segments.date → date,
 *     cost_micros/1e6 → spend); last_synced_at atualizado; sync_errors vazio.
 *  2. Token expirado (401 UNAUTHENTICATED) → refreshGoogleToken renova → retry OK;
 *     sem sync_error inserido.
 *  3. refresh inválido → refreshGoogleToken lança → sync_error com
 *     error_type='refresh_token_invalid' + ad_accounts.status='error'.
 *  4. Cron endpoint POST /api/sync/google sem x-cron-secret → 401.
 *
 * NÃO mockamos encrypt/decrypt — usamos a implementação real de @advezo/utils.
 * refreshGoogleToken (Story 2.2) É mockado para isolar a lógica de sync.
 */

const VALID_KEY = 'c'.repeat(64) // 64 hex chars = 32 bytes

interface MockCall {
  table: string
  op: 'select' | 'upsert' | 'update' | 'insert'
  payload?: unknown
  options?: unknown
}

function createSupabaseMock(opts: {
  encryptedToken: string
  encryptedRefreshToken: string
  externalAccountId: string
}) {
  const calls: MockCall[] = []

  function from(table: string) {
    const builder: Record<string, unknown> = {}

    builder.select = (_cols: string) => {
      calls.push({ table, op: 'select' })
      return {
        eq: () => ({
          eq: () => builder,
          single: async () => ({
            data:
              table === 'ad_accounts'
                ? {
                    encrypted_token: opts.encryptedToken,
                    encrypted_refresh_token: opts.encryptedRefreshToken,
                    external_account_id: opts.externalAccountId,
                  }
                : null,
            error: null,
          }),
        }),
      }
    }

    builder.upsert = (payload: unknown, options: unknown) => {
      calls.push({ table, op: 'upsert', payload, options })
      return {
        select: () => ({
          single: async () => ({ data: { id: `${table}-id` }, error: null }),
        }),
      }
    }

    builder.update = (payload: unknown) => {
      calls.push({ table, op: 'update', payload })
      return { eq: async () => ({ error: null }) }
    }

    builder.insert = (payload: unknown) => {
      calls.push({ table, op: 'insert', payload })
      return Promise.resolve({ error: null })
    }

    return builder
  }

  return { client: { from }, calls }
}

const refreshGoogleTokenMock = vi.fn()

function googleRow(overrides?: Record<string, unknown>) {
  return {
    campaign: { id: '111', name: 'Campanha Google', status: 'ENABLED' },
    metrics: {
      impressions: '2000',
      clicks: '80',
      costMicros: '12500000', // → 12.5 na moeda
      conversions: '5',
      conversionsValue: '500',
    },
    segments: { date: '2026-06-25' },
    ...overrides,
  }
}

describe('syncGoogleAccount (Story 2.4)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token'
    process.env.GOOGLE_ADS_TEST_CUSTOMER_ID = '654-574-7042'
    refreshGoogleTokenMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('1. sync bem-sucedido faz upsert de campanhas + métricas (segments.date, cost_micros/1e6)', async () => {
    const encryptedToken = encryptToken('google-access-tok', VALID_KEY)
    const encryptedRefresh = encryptToken('google-refresh-tok', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      encryptedRefreshToken: encryptedRefresh,
      externalAccountId: '6545747042',
    })

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
      createSupabaseServiceClient: vi.fn(() => client),
    }))
    vi.doMock('@/lib/oauth/google', () => ({
      refreshGoogleToken: refreshGoogleTokenMock,
    }))

    let calledUrl = ''
    const fetchMock = vi.fn(async (input: string | URL) => {
      calledUrl = String(input)
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [googleRow()] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { syncGoogleAccount } = await import('@/lib/sync/google')
    await syncGoogleAccount('acc-1', 'ws-1')

    // customer_id usa o sandbox test id, sem hífens.
    expect(calledUrl).toContain('customers/6545747042/googleAds:search')

    const metricsUpsert = calls.find(
      (c) => c.table === 'campaign_metrics' && c.op === 'upsert'
    )
    expect(metricsUpsert).toBeTruthy()
    expect((metricsUpsert?.payload as { date: string }).date).toBe('2026-06-25')
    expect((metricsUpsert?.payload as { spend: number }).spend).toBe(12.5)
    expect((metricsUpsert?.payload as { conversions: number }).conversions).toBe(5)
    expect((metricsUpsert?.payload as { revenue: number }).revenue).toBe(500)
    expect((metricsUpsert?.options as { onConflict: string }).onConflict).toBe(
      'campaign_id,date'
    )

    // Campanha mapeada ENABLED → active.
    const campaignUpsert = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'upsert'
    )
    expect((campaignUpsert?.payload as { status: string }).status).toBe('active')
    expect((campaignUpsert?.options as { onConflict: string }).onConflict).toBe(
      'ad_account_id,external_campaign_id'
    )

    // last_synced_at atualizado, status active, refresh NÃO chamado, sem sync_errors.
    const successUpdate = calls.find(
      (c) =>
        c.table === 'ad_accounts' &&
        c.op === 'update' &&
        (c.payload as { last_synced_at?: string }).last_synced_at
    )
    expect(successUpdate).toBeTruthy()
    expect(refreshGoogleTokenMock).not.toHaveBeenCalled()
    expect(calls.find((c) => c.table === 'sync_errors')).toBeUndefined()
  })

  it('2. token expirado (401) → refreshGoogleToken renova → retry OK, sem sync_error', async () => {
    const encryptedToken = encryptToken('expired-access', VALID_KEY)
    const encryptedRefresh = encryptToken('valid-refresh', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      encryptedRefreshToken: encryptedRefresh,
      externalAccountId: '6545747042',
    })

    // refresh retorna NOVO access_token JÁ CRIPTOGRAFADO (comportamento real Story 2.2).
    const newEncrypted = encryptToken('fresh-access-tok', VALID_KEY)
    refreshGoogleTokenMock.mockResolvedValue(newEncrypted)

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
      createSupabaseServiceClient: vi.fn(() => client),
    }))
    vi.doMock('@/lib/oauth/google', () => ({
      refreshGoogleToken: refreshGoogleTokenMock,
    }))

    let call = 0
    const fetchMock = vi.fn(async () => {
      call += 1
      if (call === 1) {
        return { ok: false, status: 401, json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => ({ results: [googleRow()] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { syncGoogleAccount } = await import('@/lib/sync/google')
    await syncGoogleAccount('acc-1', 'ws-1')

    expect(refreshGoogleTokenMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Sync concluiu: métricas upsertadas, sem sync_errors.
    expect(calls.find((c) => c.table === 'campaign_metrics')).toBeTruthy()
    expect(calls.find((c) => c.table === 'sync_errors')).toBeUndefined()
  })

  it('3. refresh inválido → sync_error refresh_token_invalid + status=error', async () => {
    const encryptedToken = encryptToken('expired-access', VALID_KEY)
    const encryptedRefresh = encryptToken('revoked-refresh', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      encryptedRefreshToken: encryptedRefresh,
      externalAccountId: '6545747042',
    })

    refreshGoogleTokenMock.mockRejectedValue(new Error('Google token refresh failed: 400'))

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
      createSupabaseServiceClient: vi.fn(() => client),
    }))
    vi.doMock('@/lib/oauth/google', () => ({
      refreshGoogleToken: refreshGoogleTokenMock,
    }))

    const fetchMock = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    const { syncGoogleAccount } = await import('@/lib/sync/google')

    await expect(syncGoogleAccount('acc-1', 'ws-1')).rejects.toThrow()

    const syncErrorInsert = calls.find(
      (c) => c.table === 'sync_errors' && c.op === 'insert'
    )
    expect(syncErrorInsert).toBeTruthy()
    expect((syncErrorInsert?.payload as { error_type: string }).error_type).toBe(
      'refresh_token_invalid'
    )

    const statusUpdate = calls.find(
      (c) =>
        c.table === 'ad_accounts' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'error'
    )
    expect(statusUpdate).toBeTruthy()
  })
})

describe('POST /api/sync/google — cron guard (AC 2.4.3)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret-cron-value-min-32-chars-xx'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('4. retorna 401 quando o header x-cron-secret está ausente', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServiceClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/sync/google/route')
    const res = await POST(
      new Request('http://localhost:3000/api/sync/google', { method: 'POST' })
    )

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('retorna 401 quando o header x-cron-secret está incorreto', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServiceClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/sync/google/route')
    const res = await POST(
      new Request('http://localhost:3000/api/sync/google', {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong-secret' },
      })
    )

    expect(res.status).toBe(401)
  })
})
