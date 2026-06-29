import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken } from '@advezo/utils'

/**
 * Testes unitários — Sync Meta (Story 2.3 — AC 2.3.10)
 *
 * Cobre os 4 cenários exigidos pela story:
 *  1. Sync bem-sucedido → upsert de campanhas + métricas + last_synced_at; sync_errors vazio.
 *  2. Token Meta expirado (Graph API #190 OAuthException) → status='error'/'expired'
 *     em ad_accounts + registro em sync_errors com error_type='token_expired'.
 *  3. Deduplicação → upsert de campaign_metrics usa onConflict 'campaign_id,date'
 *     (re-sync do mesmo par faz UPDATE, não INSERT).
 *  4. Cron endpoint sem header x-cron-secret → 401.
 *
 * NÃO mockamos decryptToken/encryptToken — usamos a implementação real de
 * @advezo/utils (token de fato criptografado/descriptografado).
 */

const VALID_KEY = 'a'.repeat(64) // 64 hex chars = 32 bytes

// ── Mock chainable do Supabase ───────────────────────────────────────────────
// Cada chamada `.from(table)` retorna um query builder que registra as operações.

interface MockCall {
  table: string
  op: 'select' | 'upsert' | 'update' | 'insert'
  payload?: unknown
  options?: unknown
}

function createSupabaseMock(opts: {
  encryptedToken: string
  externalAccountId: string
}) {
  const calls: MockCall[] = []

  function from(table: string) {
    const builder: Record<string, unknown> = {}

    builder.select = (_cols: string) => {
      calls.push({ table, op: 'select' })
      // Encadeamento .eq().single() para buscar a conta.
      return {
        eq: () => ({
          eq: () => builder, // para queries com dois .eq (cron — não usado aqui)
          single: async () => ({
            data:
              table === 'ad_accounts'
                ? {
                    encrypted_token: opts.encryptedToken,
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

describe('syncMetaAccount (Story 2.3)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('1. sync bem-sucedido faz upsert de campanhas + métricas e atualiza last_synced_at', async () => {
    const encryptedToken = encryptToken('long-lived-tok', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      externalAccountId: 'act_123',
    })

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    let calledUrl = ''
    const fetchMock = vi.fn(async (input: string | URL) => {
      calledUrl = String(input)
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              campaign_id: 'c1',
              campaign_name: 'Campanha 1',
              date_start: '2026-06-25',
              date_stop: '2026-06-25',
              impressions: '1000',
              clicks: '50',
              spend: '12.50',
              actions: [{ action_type: 'purchase', value: '3' }],
              action_values: [{ action_type: 'purchase', value: '300' }],
            },
          ],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { syncMetaAccount } = await import('@/lib/sync/meta')
    await syncMetaAccount('acc-1', 'ws-1')

    // time_increment=1 deve estar na URL (métricas por dia).
    expect(calledUrl).toContain('time_increment=1')
    expect(calledUrl).toContain('act_123/insights')

    const campaignUpsert = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'upsert'
    )
    const metricsUpsert = calls.find(
      (c) => c.table === 'campaign_metrics' && c.op === 'upsert'
    )
    expect(campaignUpsert).toBeTruthy()
    expect(metricsUpsert).toBeTruthy()
    expect((metricsUpsert?.payload as { date: string }).date).toBe('2026-06-25')
    expect((metricsUpsert?.payload as { conversions: number }).conversions).toBe(3)
    expect((metricsUpsert?.payload as { revenue: number }).revenue).toBe(300)

    // last_synced_at atualizado, status active.
    const successUpdate = calls.find(
      (c) =>
        c.table === 'ad_accounts' &&
        c.op === 'update' &&
        (c.payload as { last_synced_at?: string }).last_synced_at
    )
    expect(successUpdate).toBeTruthy()
    expect((successUpdate?.payload as { status: string }).status).toBe('active')

    // Nenhum sync_error gravado.
    expect(calls.find((c) => c.table === 'sync_errors')).toBeUndefined()
  })

  it('2. token expirado (#190) grava status=expired em ad_accounts e sync_errors', async () => {
    const encryptedToken = encryptToken('expired-tok', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      externalAccountId: 'act_123',
    })

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 190,
          type: 'OAuthException',
          message: 'Error validating access token: Session has expired.',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { syncMetaAccount } = await import('@/lib/sync/meta')

    await expect(syncMetaAccount('acc-1', 'ws-1')).rejects.toThrow()

    // ad_accounts atualizado para 'expired'.
    const statusUpdate = calls.find(
      (c) =>
        c.table === 'ad_accounts' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'expired'
    )
    expect(statusUpdate).toBeTruthy()

    // sync_errors registrado com error_type token_expired (NFR-4).
    const syncErrorInsert = calls.find(
      (c) => c.table === 'sync_errors' && c.op === 'insert'
    )
    expect(syncErrorInsert).toBeTruthy()
    expect((syncErrorInsert?.payload as { error_type: string }).error_type).toBe(
      'token_expired'
    )
  })

  it('3. deduplicação — upsert de campaign_metrics usa onConflict campaign_id,date', async () => {
    const encryptedToken = encryptToken('tok', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      externalAccountId: 'act_123',
    })

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            campaign_id: 'c1',
            campaign_name: 'Campanha 1',
            date_start: '2026-06-25',
            impressions: '10',
            clicks: '1',
            spend: '1',
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { syncMetaAccount } = await import('@/lib/sync/meta')
    await syncMetaAccount('acc-1', 'ws-1')

    const metricsUpsert = calls.find(
      (c) => c.table === 'campaign_metrics' && c.op === 'upsert'
    )
    expect((metricsUpsert?.options as { onConflict: string }).onConflict).toBe(
      'campaign_id,date'
    )

    const campaignUpsert = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'upsert'
    )
    expect((campaignUpsert?.options as { onConflict: string }).onConflict).toBe(
      'ad_account_id,external_campaign_id'
    )
  })

  it('5. deduplicação de action_types sinônimos — offsite_conversion.fb_pixel_purchase tem prioridade sobre purchase', async () => {
    // Regressão explícita do bug v1: a Meta API retorna os dois tipos na mesma
    // resposta. Somar ambos causa o dobro da contagem real (caso documentado: 78
    // mostrados no sistema, 39 reais na Meta). A função deve usar apenas o tipo
    // mais específico presente e ignorar os demais.
    const encryptedToken = encryptToken('tok', VALID_KEY)
    const { client, calls } = createSupabaseMock({
      encryptedToken,
      externalAccountId: 'act_123',
    })

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            campaign_id: 'c1',
            campaign_name: 'Campanha 1',
            date_start: '2026-06-25',
            impressions: '1000',
            clicks: '50',
            spend: '200',
            // Meta retorna AMBOS os tipos sinônimos para a mesma compra
            actions: [
              { action_type: 'purchase', value: '39' },
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '39' },
              { action_type: 'link_click', value: '500' }, // não é compra — deve ser ignorado
            ],
            action_values: [
              { action_type: 'purchase', value: '3900' },
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3900' },
            ],
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { syncMetaAccount } = await import('@/lib/sync/meta')
    await syncMetaAccount('acc-1', 'ws-1')

    const metricsUpsert = calls.find(
      (c) => c.table === 'campaign_metrics' && c.op === 'upsert'
    )
    const payload = metricsUpsert?.payload as { conversions: number; revenue: number }

    // Deve usar offsite_conversion.fb_pixel_purchase (prioridade) e ignorar purchase.
    // Resultado: 39 conversões (não 78) e 3900 de receita (não 7800).
    expect(payload.conversions).toBe(39)
    expect(payload.revenue).toBe(3900)
  })
})

describe('POST /api/sync/meta — cron guard (AC 2.3.4)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret-cron-value-min-32-chars-xx'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('4. retorna 401 quando o header x-cron-secret está ausente', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(),
      createSupabaseServiceClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/sync/meta/route')
    const res = await POST(new Request('http://localhost:3000/api/sync/meta', {
      method: 'POST',
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('retorna 401 quando o header x-cron-secret está incorreto', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(),
      createSupabaseServiceClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/sync/meta/route')
    const res = await POST(
      new Request('http://localhost:3000/api/sync/meta', {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong-secret' },
      })
    )

    expect(res.status).toBe(401)
  })
})
