import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Testes unitários — Webhook Meta Lead Ads (Story 8.5).
 *
 * Foco CRÍTICO (AC 8.5.3 — segurança da assinatura): a validação de X-Hub-Signature-256
 * é a PRIMEIRA operação do POST. Três cenários explícitos obrigatórios:
 *   - assinatura ausente → 403
 *   - assinatura com body adulterado → 403
 *   - assinatura válida → 200
 *
 * A criptografia (createHmac) NÃO é mockada — assinamos os bodies de teste com o mesmo
 * algoritmo do handler, provando que a validação real funciona. Apenas @advezo/database
 * é mockado.
 *
 * Demais cenários: challenge verify (token existente → hub.challenge; inexistente → 403),
 * dedup 23505 → 200 idempotente, múltiplos changes → todos inseridos.
 */

const APP_SECRET = 'test-meta-app-secret'

/** Assina um raw body com o mesmo algoritmo do handler (HMAC-SHA256, prefixo sha256=). */
function sign(rawBody: string, secret = APP_SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
}

interface AdAccountRow {
  id: string
  workspace_id: string
}

interface QueueInsertCall {
  payload: Record<string, unknown>
}

interface MockConfig {
  /** workspace_settings lookup (challenge verify): linha encontrada ou null → 403. */
  verifyTokenRow?: { workspace_id: string } | null
  /** ad_accounts lookup por external_account_id: mapa externalId → row (ou ausente → null). */
  adAccounts?: Record<string, AdAccountRow>
  /** erro a devolver no INSERT em lead_processing_queue (ex: { code: '23505' }). */
  insertError?: { code?: string; message?: string } | null
}

interface Capture {
  /** todos os payloads passados a lead_processing_queue.insert(). */
  inserts: QueueInsertCall[]
}

function createSupabaseMock(config: MockConfig, capture: Capture) {
  function from(table: string) {
    if (table === 'workspace_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: config.verifyTokenRow ?? null,
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'ad_accounts') {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => ({
              data: config.adAccounts?.[value] ?? null,
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'lead_processing_queue') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          capture.inserts.push({ payload })
          return { error: config.insertError ?? null }
        },
      }
    }

    throw new Error(`unexpected table ${table}`)
  }

  return { from }
}

async function loadRoute(config: MockConfig, capture: Capture) {
  vi.doMock('@advezo/database', () => ({
    createSupabaseServiceClient: vi.fn(() => createSupabaseMock(config, capture)),
  }))
  return import('@/app/api/webhooks/meta/leadgen/route')
}

function postRequest(rawBody: string, signature?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature !== undefined) headers['x-hub-signature-256'] = signature
  return new Request('http://localhost:3000/api/webhooks/meta/leadgen', {
    method: 'POST',
    headers,
    body: rawBody,
  })
}

function getRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/webhooks/meta/leadgen')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString(), { method: 'GET' })
}

/** Body Meta válido com N leads (changes). */
function leadgenBody(
  leads: { leadgen_id: string; ad_account_id: string }[]
): string {
  return JSON.stringify({
    object: 'page',
    entry: [
      {
        id: 'page-1',
        time: 1700000000,
        changes: leads.map((l) => ({
          field: 'leadgen',
          value: {
            leadgen_id: l.leadgen_id,
            ad_account_id: l.ad_account_id,
            page_id: 'page-1',
            form_id: 'form-1',
            created_time: 1700000000,
          },
        })),
      },
    ],
  })
}

const emptyCapture = (): Capture => ({ inserts: [] })

describe('Webhook Meta Lead Ads — POST signature security (Story 8.5)', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─────────────────────────────────────────────────────────────
  // AC 8.5.3 — SEGURANÇA DA ASSINATURA (CRÍTICO)
  // ─────────────────────────────────────────────────────────────

  it('[CRÍTICO] assinatura ausente → 403 (sem processar payload)', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute({}, capture)

    const body = leadgenBody([{ leadgen_id: 'L1', ad_account_id: 'act_1' }])
    const res = await POST(postRequest(body)) // sem header de assinatura

    expect(res.status).toBe(403)
    // Nada é enfileirado quando a assinatura está ausente.
    expect(capture.inserts).toHaveLength(0)
  })

  it('[CRÍTICO] assinatura com body adulterado → 403', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      { adAccounts: { act_1: { id: 'aa-1', workspace_id: 'ws-1' } } },
      capture
    )

    const originalBody = leadgenBody([
      { leadgen_id: 'L1', ad_account_id: 'act_1' },
    ])
    // Assinatura calculada sobre o body original...
    const signature = sign(originalBody)
    // ...mas enviamos um body adulterado (lead diferente).
    const tamperedBody = leadgenBody([
      { leadgen_id: 'L-EVIL', ad_account_id: 'act_1' },
    ])

    const res = await POST(postRequest(tamperedBody, signature))

    expect(res.status).toBe(403)
    expect(capture.inserts).toHaveLength(0)
  })

  it('[CRÍTICO] assinatura válida → 200 (ACK)', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      { adAccounts: { act_1: { id: 'aa-1', workspace_id: 'ws-1' } } },
      capture
    )

    const body = leadgenBody([{ leadgen_id: 'L1', ad_account_id: 'act_1' }])
    const res = await POST(postRequest(body, sign(body)))

    expect(res.status).toBe(200)
    expect(capture.inserts).toHaveLength(1)
    expect(capture.inserts[0].payload).toMatchObject({
      workspace_id: 'ws-1',
      meta_lead_id: 'L1',
      ad_account_id: 'aa-1',
      status: 'pending',
    })
  })

  it('assinatura com secret errado → 403', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      { adAccounts: { act_1: { id: 'aa-1', workspace_id: 'ws-1' } } },
      capture
    )

    const body = leadgenBody([{ leadgen_id: 'L1', ad_account_id: 'act_1' }])
    // Assinatura computada com um secret diferente do META_APP_SECRET do servidor.
    const res = await POST(postRequest(body, sign(body, 'wrong-secret')))

    expect(res.status).toBe(403)
    expect(capture.inserts).toHaveLength(0)
  })

  it('META_APP_SECRET ausente → 500 (fail closed, sem bypass)', async () => {
    delete process.env.META_APP_SECRET
    const capture = emptyCapture()
    const { POST } = await loadRoute({}, capture)

    const body = leadgenBody([{ leadgen_id: 'L1', ad_account_id: 'act_1' }])
    const res = await POST(postRequest(body, sign(body)))

    expect(res.status).toBe(500)
    expect(capture.inserts).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────
  // AC 8.5.4 — Enfileiramento e dedup
  // ─────────────────────────────────────────────────────────────

  it('dedup: INSERT retorna 23505 → 200 idempotente (redelivery da Meta)', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        adAccounts: { act_1: { id: 'aa-1', workspace_id: 'ws-1' } },
        insertError: { code: '23505', message: 'lead_queue_meta_lead_id_unique' },
      },
      capture
    )

    const body = leadgenBody([{ leadgen_id: 'L1', ad_account_id: 'act_1' }])
    const res = await POST(postRequest(body, sign(body)))

    // 23505 é idempotente: ainda devolvemos 200 (ACK), Meta para de reentregar.
    expect(res.status).toBe(200)
    expect(capture.inserts).toHaveLength(1)
  })

  it('múltiplos changes → todos inseridos na fila', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      {
        adAccounts: {
          act_1: { id: 'aa-1', workspace_id: 'ws-1' },
          act_2: { id: 'aa-2', workspace_id: 'ws-2' },
        },
      },
      capture
    )

    const body = leadgenBody([
      { leadgen_id: 'L1', ad_account_id: 'act_1' },
      { leadgen_id: 'L2', ad_account_id: 'act_2' },
    ])
    const res = await POST(postRequest(body, sign(body)))

    expect(res.status).toBe(200)
    expect(capture.inserts).toHaveLength(2)
    expect(capture.inserts.map((c) => c.payload.meta_lead_id)).toEqual([
      'L1',
      'L2',
    ])
  })

  it('ad_account não mapeado → ignorado silenciosamente, 200 sem insert', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute({ adAccounts: {} }, capture)

    const body = leadgenBody([
      { leadgen_id: 'L1', ad_account_id: 'act_desconhecido' },
    ])
    const res = await POST(postRequest(body, sign(body)))

    expect(res.status).toBe(200)
    expect(capture.inserts).toHaveLength(0)
  })

  it('change com field != leadgen → ignorado', async () => {
    const capture = emptyCapture()
    const { POST } = await loadRoute(
      { adAccounts: { act_1: { id: 'aa-1', workspace_id: 'ws-1' } } },
      capture
    )

    const rawBody = JSON.stringify({
      object: 'page',
      entry: [
        {
          changes: [
            { field: 'feed', value: { leadgen_id: 'X', ad_account_id: 'act_1' } },
          ],
        },
      ],
    })
    const res = await POST(postRequest(rawBody, sign(rawBody)))

    expect(res.status).toBe(200)
    expect(capture.inserts).toHaveLength(0)
  })
})

describe('Webhook Meta Lead Ads — GET challenge verification (Story 8.5)', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('token existente + mode=subscribe → 200 ecoando hub.challenge', async () => {
    const capture = emptyCapture()
    const { GET } = await loadRoute(
      { verifyTokenRow: { workspace_id: 'ws-1' } },
      capture
    )

    const res = await GET(
      getRequest({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'tok-existente',
        'hub.challenge': 'challenge-12345',
      })
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('challenge-12345')
  })

  it('token inexistente → 403', async () => {
    const capture = emptyCapture()
    const { GET } = await loadRoute({ verifyTokenRow: null }, capture)

    const res = await GET(
      getRequest({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'tok-inexistente',
        'hub.challenge': 'challenge-12345',
      })
    )

    expect(res.status).toBe(403)
  })

  it('mode != subscribe → 403 sem lookup', async () => {
    const capture = emptyCapture()
    const { GET } = await loadRoute(
      { verifyTokenRow: { workspace_id: 'ws-1' } },
      capture
    )

    const res = await GET(
      getRequest({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'tok-existente',
        'hub.challenge': 'challenge-12345',
      })
    )

    expect(res.status).toBe(403)
  })
})
