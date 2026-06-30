import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken, normalizePhone } from '@advezo/utils'

/**
 * Testes unitários — Processamento assíncrono de Lead Ads (Story 8.6).
 *
 * Foco nos AC críticos:
 *  - AC 8.6.1: sem x-cron-secret → 401 (sem processar).
 *  - AC 8.6.2: Promise.allSettled — falha de um item NÃO cancela os demais.
 *  - AC 8.6.3: erro Graph API → retry_count++ (volta a 'pending'); 3 falhas → 'failed' +
 *    sync_errors.
 *  - AC 8.6.5: phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_id); email_encrypted
 *    AES-256-GCM sempre presente; consent_given_at = null.
 *  - AC 8.6.6: dedup 23505 → queue 'completed', SEM CAPI (action:'none' → skipped).
 *
 * `@advezo/utils` (crypto/phone) NÃO é mockado — provamos hash/cripto reais. `fetch` é
 * mockado (Graph API). `@/lib/capi/leads` é mockado para observar (sem rede) se o CAPI foi
 * disparado. O token é cifrado com a MESMA chave que o handler descriptografa.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEY = 'a'.repeat(64) // 32 bytes em hex (TOKEN_ENCRYPTION_KEY de teste)
const CRON_SECRET = 'test-cron-secret'
const WORKSPACE_ID = 'ws-1'
const AD_ACCOUNT_ID = 'aa-1'

/** Linha de fila de teste com overrides. */
function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    workspace_id: WORKSPACE_ID,
    meta_lead_id: 'L1',
    ad_account_id: AD_ACCOUNT_ID,
    status: 'pending',
    retry_count: 0,
    last_error: null,
    enqueued_at: '2026-06-30T00:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

interface MockConfig {
  /** itens pending retornados pelo SELECT inicial. */
  pending: Record<string, unknown>[]
  /** linha de ad_accounts (token cifrado). null → conta não encontrada. */
  adAccount?: Record<string, unknown> | null
  /** lead_ads_config encontrada (client_id) ou null (lead órfão). */
  leadAdsConfig?: { client_id: string | null } | null
  /** erro a devolver no INSERT em leads (ex: { code: '23505' }). */
  leadInsertError?: { code?: string; message?: string } | null
}

interface Capture {
  /** todos os UPDATE em lead_processing_queue: { id, patch }. */
  queueUpdates: { id: string; patch: Record<string, unknown> }[]
  /** payloads passados a leads.insert(). */
  leadInserts: Record<string, unknown>[]
  /** payloads passados a sync_errors.insert(). */
  syncErrors: Record<string, unknown>[]
}

const emptyCapture = (): Capture => ({
  queueUpdates: [],
  leadInserts: [],
  syncErrors: [],
})

/**
 * Mock de Supabase service-role. Cobre a cadeia de queries usada pelo route:
 *  - lead_processing_queue: select().eq().order().limit() | update().eq()
 *  - ad_accounts: select().eq().maybeSingle()
 *  - lead_ads_configs: select().eq().eq().limit().maybeSingle()
 *  - leads: insert().select().single()
 *  - sync_errors: insert()
 */
function makeSupabase(config: MockConfig, capture: Capture) {
  function from(table: string): any {
    if (table === 'lead_processing_queue') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: config.pending, error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            capture.queueUpdates.push({ id, patch })
            return { data: null, error: null }
          },
        }),
      }
    }

    if (table === 'ad_accounts') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: config.adAccount ?? null,
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'lead_ads_configs') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: config.leadAdsConfig ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'leads') {
      return {
        insert: (payload: Record<string, unknown>) => {
          capture.leadInserts.push(payload)
          return {
            select: () => ({
              single: async () => {
                if (config.leadInsertError) {
                  return { data: null, error: config.leadInsertError }
                }
                return {
                  data: { id: 'lead-1', ...payload },
                  error: null,
                }
              },
            }),
          }
        },
      }
    }

    if (table === 'sync_errors') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          capture.syncErrors.push(payload)
          return { data: null, error: null }
        },
      }
    }

    throw new Error(`unexpected table: ${table}`)
  }

  return { from }
}

/** Spies sobre as funções CAPI (sem rede). */
const sendLeadCapiSpy = vi.fn(async () => ({ status: 'sent', eventName: 'Lead' }))
const sendCompleteRegistrationCapiSpy = vi.fn(async () => ({
  status: 'sent',
  eventName: 'CompleteRegistration',
}))

async function loadRoute(config: MockConfig, capture: Capture) {
  vi.doMock('@advezo/database', () => ({
    createSupabaseServiceClient: vi.fn(() => makeSupabase(config, capture)),
  }))
  vi.doMock('@/lib/capi/leads', () => ({
    sendLeadCapi: sendLeadCapiSpy,
    sendCompleteRegistrationCapi: sendCompleteRegistrationCapiSpy,
  }))
  return import('@/app/api/leads/process-queue/route')
}

function postRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers['x-cron-secret'] = secret
  return new Request('http://localhost:3000/api/leads/process-queue', {
    method: 'POST',
    headers,
  })
}

/** Resposta Graph API mockada (campos de topo). */
function graphResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      full_name: 'João Silva',
      phone_number: '11987654321',
      email: 'joao@example.com',
      field_data: [{ name: 'cidade', values: ['São Paulo'] }],
      ...over,
    }),
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  process.env.TOKEN_ENCRYPTION_KEY = KEY
  vi.resetModules()
  sendLeadCapiSpy.mockClear()
  sendCompleteRegistrationCapiSpy.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('process-queue — guard x-cron-secret (AC 8.6.1)', () => {
  it('sem header x-cron-secret → 401 (sem processar)', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute({ pending: [] }, capture)

    const res = await POST(postRequest())

    expect(res.status).toBe(401)
    expect(capture.queueUpdates).toHaveLength(0)
  })

  it('header com secret divergente → 401', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute({ pending: [] }, capture)

    const res = await POST(postRequest('wrong-secret'))

    expect(res.status).toBe(401)
  })

  it('secret correto, fila vazia → 200 { processed:0, failed:0, skipped:0 }', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute({ pending: [] }, capture)

    const res = await POST(postRequest(CRON_SECRET))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processed: 0, failed: 0, skipped: 0 })
  })
})

describe('process-queue — sucesso completo (AC 8.6.4–8.6.8)', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => graphResponse())
    vi.stubGlobal('fetch', fetchMock)
  })

  it('item pending → lead inserido → queue completed → { processed:1 }', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [makeQueueItem()],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('real-meta-token', KEY),
          external_account_id: 'act_123',
        },
        leadAdsConfig: { client_id: 'client-1' },
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ processed: 1, failed: 0, skipped: 0 })

    // Lead inserido com os campos esperados (AC 8.6.4 / 8.6.5).
    expect(capture.leadInserts).toHaveLength(1)
    const lead = capture.leadInserts[0]
    expect(lead.source).toBe('lead_ads')
    expect(lead.status).toBe('novo')
    expect(lead.meta_lead_id).toBe('L1')
    expect(lead.name).toBe('João Silva')
    expect(lead.client_id).toBe('client-1')
    expect(lead.consent_given_at).toBeNull() // AC 8.6.5

    // phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_id) — hash REAL (AC 8.6.5).
    const expectedHash = createHmac('sha256', WORKSPACE_ID)
      .update(normalizePhone('11987654321'))
      .digest('hex')
    expect(lead.phone_hash).toBe(expectedHash)

    // email_encrypted: AES-256-GCM presente (não texto plano) — sempre para lead_ads.
    expect(typeof lead.email_encrypted).toBe('string')
    expect(lead.email_encrypted).not.toContain('joao@example.com')

    // CAPI Lead disparado; CompleteRegistration NÃO (lead_ads sem qualification_rules).
    expect(sendLeadCapiSpy).toHaveBeenCalledTimes(1)
    expect(sendCompleteRegistrationCapiSpy).not.toHaveBeenCalled()

    // Queue: processing → completed.
    const statuses = capture.queueUpdates.map((u) => u.patch.status)
    expect(statuses).toContain('processing')
    expect(statuses).toContain('completed')
  })

  it('lead órfão (sem lead_ads_config) → client_id null, ainda processa', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [makeQueueItem()],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('tok', KEY),
          external_account_id: 'act_123',
        },
        leadAdsConfig: null,
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    expect((await res.json()).processed).toBe(1)
    expect(capture.leadInserts[0].client_id).toBeNull()
  })
})

describe('process-queue — dedup 23505 (AC 8.6.6 CRÍTICO)', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => graphResponse())
    vi.stubGlobal('fetch', fetchMock)
  })

  it('INSERT leads 23505 → queue completed, SEM CAPI → { skipped:1 }', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [makeQueueItem()],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('tok', KEY),
          external_account_id: 'act_123',
        },
        leadAdsConfig: { client_id: 'client-1' },
        leadInsertError: { code: '23505', message: 'leads_meta_lead_id_unique' },
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ processed: 0, failed: 0, skipped: 1 })

    // CAPI NUNCA chamado num dedup (lead já existe).
    expect(sendLeadCapiSpy).not.toHaveBeenCalled()
    expect(sendCompleteRegistrationCapiSpy).not.toHaveBeenCalled()

    // Queue marcada como completed mesmo no dedup (idempotência).
    expect(capture.queueUpdates.map((u) => u.patch.status)).toContain('completed')

    // Nenhum sync_errors no dedup (não é falha).
    expect(capture.syncErrors).toHaveLength(0)
  })
})

describe('process-queue — retry (AC 8.6.3)', () => {
  it('Graph API erro (retry_count 0) → retry_count=1, status=pending', async () => {
    fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid lead' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [makeQueueItem({ retry_count: 0 })],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('tok', KEY),
          external_account_id: 'act_123',
        },
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    expect((await res.json())).toEqual({ processed: 0, failed: 1, skipped: 0 })

    // Falha não-terminal: volta a pending com retry_count incrementado.
    const failureUpdate = capture.queueUpdates.find(
      (u) => u.patch.retry_count === 1
    )
    expect(failureUpdate?.patch.status).toBe('pending')
    expect(failureUpdate?.patch.last_error).toBe('Invalid lead')

    // Sem sync_errors enquanto retry < 3.
    expect(capture.syncErrors).toHaveLength(0)
  })

  it('Graph API erro na 3ª tentativa (retry_count 2) → status=failed + sync_errors', async () => {
    fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Server error' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [makeQueueItem({ retry_count: 2 })],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('tok', KEY),
          external_account_id: 'act_123',
        },
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    expect((await res.json()).failed).toBe(1)

    const failureUpdate = capture.queueUpdates.find(
      (u) => u.patch.retry_count === 3
    )
    expect(failureUpdate?.patch.status).toBe('failed')

    // NFR-4: falha terminal registrada em sync_errors.
    expect(capture.syncErrors).toHaveLength(1)
    expect(capture.syncErrors[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      ad_account_id: AD_ACCOUNT_ID,
      error_type: 'lead_processing_failed',
    })
  })
})

describe('process-queue — Promise.allSettled isola falhas (AC 8.6.2 CRÍTICO)', () => {
  it('3 itens, 1 falha na Graph API → { processed:2, failed:1 }', async () => {
    // L2 falha na Graph API; L1 e L3 sucedem.
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/L2?') || url.includes('/L2&') || url.includes('/L2')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'bad L2' } }),
        }
      }
      return graphResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        pending: [
          makeQueueItem({ id: 'q-1', meta_lead_id: 'L1' }),
          makeQueueItem({ id: 'q-2', meta_lead_id: 'L2' }),
          makeQueueItem({ id: 'q-3', meta_lead_id: 'L3' }),
        ],
        adAccount: {
          id: AD_ACCOUNT_ID,
          workspace_id: WORKSPACE_ID,
          encrypted_token: encryptToken('tok', KEY),
          external_account_id: 'act_123',
        },
        leadAdsConfig: { client_id: 'client-1' },
      },
      capture
    )

    const res = await POST(postRequest(CRON_SECRET))
    const body = await res.json()

    // A falha de L2 NÃO impede L1 e L3 de processarem (AC 8.6.2).
    expect(body).toEqual({ processed: 2, failed: 1, skipped: 0 })
    expect(capture.leadInserts).toHaveLength(2) // só L1 e L3 inserem
  })
})
