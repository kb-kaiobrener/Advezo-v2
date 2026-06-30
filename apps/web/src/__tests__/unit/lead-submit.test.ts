import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decryptToken } from '@advezo/utils'

/**
 * Testes unitários — POST /api/leads/submit (Story 8.3).
 *
 * Foco crítico (AC 8.3.3 — gate de consentimento LGPD): o servidor REJEITA com 422
 * qualquer submissão com email sem consent === true — rejeição ativa, nunca
 * "aceitar e ignorar". Dois cenários explícitos obrigatórios:
 *   - { email, consent: false } → 422
 *   - { email } (consent ausente) → 422
 *
 * Demais cenários: caminho feliz com consent (email_encrypted + consent_given_at não
 * nulos), sem email (ambos null), embed_token inválido (401), formulário inativo (410),
 * dedup 23505 (409), rate limit por IP (429).
 *
 * O mock de Supabase espelha as cadeias usadas na route:
 *   - lead_forms: .select(...).eq('embed_token', t).maybeSingle()
 *   - leads (rate limit IP): .select('*',{count,head}).eq.eq.eq.gte
 *   - leads (rate limit token): .select('*',{count,head}).eq.eq.gte
 *   - leads (insert): .insert(payload).select('id').single()
 *
 * encryptToken/decryptToken NÃO são mockados — criptografia real, para provar que
 * email_encrypted é decriptável (consent) ou null (sem consent).
 */

const VALID_KEY = 'b'.repeat(64) // 32 bytes em hex

interface FormRow {
  id: string
  workspace_id: string
  client_id: string | null
  is_active: boolean
  qualification_rules: unknown[]
}

interface MockConfig {
  /** Linha de lead_forms devolvida pelo lookup (ou null → 401). */
  form?: FormRow | null
  /** count devolvido pela query de rate limit por IP. */
  ipCount?: number
  /** count devolvido pela query de rate limit por token. */
  tokenCount?: number
  /** erro a devolver no INSERT em leads (ex: { code: '23505' }). */
  insertError?: { code?: string; message?: string } | null
}

interface InsertCapture {
  payload: Record<string, unknown> | null
}

function createSupabaseMock(config: MockConfig, capture: InsertCapture) {
  // Distingue as duas queries de count (IP vem antes de token).
  let countCallIndex = 0

  function from(table: string) {
    if (table === 'lead_forms') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: config.form ?? null,
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'leads') {
      return {
        // Rate limit: select('*', { count, head }) → cadeia de eq/gte que resolve no await.
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            // Terminal: a query é awaited após .gte(). Retornamos um thenable que,
            // independentemente de quantos .eq() forem encadeados, resolve no .gte().
            const makeChain = () => {
              const chain: Record<string, unknown> = {}
              chain.eq = () => chain
              chain.gte = async () => {
                const isIpQuery = countCallIndex === 0
                countCallIndex += 1
                const count = isIpQuery
                  ? (config.ipCount ?? 0)
                  : (config.tokenCount ?? 0)
                return { count, error: null }
              }
              return chain
            }
            return makeChain()
          }
          // insert(...).select('id').single()
          return {
            single: async () => ({
              data: capture.payload ? { id: 'lead-new-1' } : { id: 'lead-new-1' },
              error: config.insertError ?? null,
            }),
          }
        },
        insert: (payload: Record<string, unknown>) => {
          capture.payload = payload
          return {
            select: () => ({
              single: async () => {
                if (config.insertError) {
                  return { data: null, error: config.insertError }
                }
                return { data: { id: 'lead-new-1' }, error: null }
              },
            }),
          }
        },
      }
    }

    throw new Error(`unexpected table ${table}`)
  }

  return { from }
}

function activeForm(overrides: Partial<FormRow> = {}): FormRow {
  return {
    id: 'form-1',
    workspace_id: 'ws-1',
    client_id: 'client-1',
    is_active: true,
    qualification_rules: [],
    ...overrides,
  }
}

function postRequest(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost:3000/api/leads/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

async function loadRoute(config: MockConfig, capture: InsertCapture) {
  vi.doMock('@advezo/database', () => ({
    createSupabaseServiceClient: vi.fn(() => createSupabaseMock(config, capture)),
  }))
  return import('@/app/api/leads/submit/route')
}

describe('POST /api/leads/submit (Story 8.3)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ─────────────────────────────────────────────────────────────
  // AC 8.3.3 — GATE DE CONSENTIMENTO (CRÍTICO)
  // ─────────────────────────────────────────────────────────────

  it('[CRÍTICO] email + consent:false → 422 (rejeição ativa LGPD)', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute({ form: activeForm() }, capture)

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'João',
        phone: '+5511998765432',
        email: 'x@x.com',
        consent: false,
      })
    )

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('Consentimento obrigatório')
    // NUNCA processa/insere quando o consent é rejeitado.
    expect(capture.payload).toBeNull()
  })

  it('[CRÍTICO] email + consent ausente → 422 (rejeição ativa LGPD)', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute({ form: activeForm() }, capture)

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'João',
        phone: '+5511998765432',
        email: 'x@x.com',
        // consent ausente
      })
    )

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('Consentimento obrigatório')
    expect(capture.payload).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // Caminho feliz
  // ─────────────────────────────────────────────────────────────

  it('email + consent:true → 201, email_encrypted decriptável e consent_given_at não nulo', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm(), ipCount: 0, tokenCount: 0 },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Maria',
        phone: '+5511912345678',
        email: 'maria@example.com',
        consent: true,
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.lead_id).toBe('lead-new-1')

    const payload = capture.payload!
    expect(payload.source).toBe('landing_page')
    expect(payload.status).toBe('novo')
    // email_encrypted não nulo E decriptável para o email original (AES-256-GCM real).
    expect(payload.email_encrypted).toBeTruthy()
    expect(decryptToken(payload.email_encrypted as string, VALID_KEY)).toBe(
      'maria@example.com'
    )
    // consent_given_at não nulo.
    expect(payload.consent_given_at).toBeTruthy()
    // phone_hash é HMAC hex (64 chars), não o telefone em claro.
    expect(payload.phone_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(String(payload.phone_hash)).not.toContain('11912345678')
  })

  it('sem email → 201, email_encrypted=null e consent_given_at=null', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm(), ipCount: 0, tokenCount: 0 },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Sem Email',
        phone: '+5511988887777',
        // sem email, sem consent
      })
    )

    expect(res.status).toBe(201)
    const payload = capture.payload!
    expect(payload.email_encrypted).toBeNull()
    expect(payload.consent_given_at).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // Autenticação por embed_token
  // ─────────────────────────────────────────────────────────────

  it('embed_token inválido → 401', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute({ form: null }, capture)

    const res = await POST(
      postRequest({
        embed_token: 'inexistente',
        name: 'X',
        phone: '+5511988887777',
      })
    )

    expect(res.status).toBe(401)
    expect(capture.payload).toBeNull()
  })

  it('formulário inativo (is_active=false) → 410 Gone', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm({ is_active: false }) },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'X',
        phone: '+5511988887777',
      })
    )

    expect(res.status).toBe(410)
    expect(capture.payload).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // Dedup e rate limit
  // ─────────────────────────────────────────────────────────────

  it('dedup: INSERT retorna 23505 → 409 lead_already_exists', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      {
        form: activeForm(),
        ipCount: 0,
        tokenCount: 0,
        insertError: { code: '23505', message: 'leads_active_dedup' },
      },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Duplicado',
        phone: '+5511988887777',
      })
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('lead_already_exists')
  })

  it('rate limit por IP excedido (>=5/hora) → 429', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm(), ipCount: 5, tokenCount: 0 },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Flood',
        phone: '+5511988887777',
      })
    )

    expect(res.status).toBe(429)
    expect(capture.payload).toBeNull()
  })

  it('rate limit por embed_token excedido (>=100/dia) → 429', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm(), ipCount: 0, tokenCount: 100 },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Flood Token',
        phone: '+5511988887777',
      })
    )

    expect(res.status).toBe(429)
    expect(capture.payload).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // Validação Zod
  // ─────────────────────────────────────────────────────────────

  it('phone em formato inválido → 422 validation_error', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute({ form: activeForm() }, capture)

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Phone Ruim',
        phone: '12345',
      })
    )

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('validation_error')
    expect(body.fields.phone).toBeTruthy()
  })

  // ─────────────────────────────────────────────────────────────
  // CORS (AC 8.3.1)
  // ─────────────────────────────────────────────────────────────

  it('OPTIONS preflight → 200 com headers CORS abertos', async () => {
    const capture: InsertCapture = { payload: null }
    const { OPTIONS } = await loadRoute({ form: activeForm() }, capture)

    const res = OPTIONS()
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
  })

  it('POST inclui headers CORS na response', async () => {
    const capture: InsertCapture = { payload: null }
    const { POST } = await loadRoute(
      { form: activeForm(), ipCount: 0, tokenCount: 0 },
      capture
    )

    const res = await POST(
      postRequest({
        embed_token: 'tok-abc',
        name: 'Cors',
        phone: '+5511988887777',
      })
    )

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
