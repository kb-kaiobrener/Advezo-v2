import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { encryptToken } from '@advezo/utils'
import type { Lead } from '@advezo/types'
import {
  buildUserData,
  buildCapiPayload,
  checkCAPIGate,
  sendLeadCapi,
  sendCompleteRegistrationCapi,
} from '@/lib/capi/leads'

/**
 * Testes unitários — disparo CAPI de leads (Story 8.7).
 *
 * Foco CRÍTICO (AC 8.7.2 — gate de consentimento LGPD diferenciado por fonte):
 *  - landing_page SEM consent → user_data.em AUSENTE
 *  - landing_page COM consent → user_data.em PRESENTE
 *  - lead_ads (qualquer) → user_data.em SEMPRE PRESENTE (base legal: termos Meta)
 *
 * Demais cenários: gate de envio não satisfeito → status='skipped' (CAPI não chamado),
 * SHA256(email) nunca persistido, lead_id presente para lead_ads, event_id = lead.id.
 *
 * `encryptToken` NÃO é mockado — criptografia real, para provar a descriptografia em
 * memória → SHA256. `fetch` é mockado para interceptar (ou não) a chamada à Graph API.
 */

const KEY = 'a'.repeat(64) // 32 bytes em hex (TOKEN_ENCRYPTION_KEY de teste)
const EMAIL = 'Lead@Example.com '
const EXPECTED_EM = createHash('sha256').update(EMAIL.trim().toLowerCase()).digest('hex')

/** Constrói uma linha de `leads` de teste com overrides. */
function makeLead(overrides: Partial<Lead> = {}): Lead {
  const base: Lead = {
    id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'ws-1',
    client_id: 'client-1',
    lead_form_id: 'form-1',
    meta_lead_id: null,
    source: 'landing_page',
    status: 'novo',
    name: 'Fulano',
    phone_hash: 'hmac-phone-hash-abc',
    email_encrypted: null,
    consent_given_at: null,
    field_data: {},
    qualified_at: null,
    converted_at: null,
    created_at: '2026-06-30T00:00:00Z',
    updated_at: '2026-06-30T00:00:00Z',
  }
  return { ...base, ...overrides }
}

/** email_encrypted válido (AES-256-GCM real) para o email de teste. */
function encryptedEmail(): string {
  return encryptToken(EMAIL, KEY)
}

/**
 * Mock de Supabase. Configurável por tabela:
 *  - workspace_settings: { meta_pixel_id, meta_conversions_api_enabled? }
 *  - ad_accounts: { encrypted_token, status }
 *  - conversion_events: existe? (controla persistência) + captura de inserts
 */
interface SupaConfig {
  pixelId?: string | null
  capiEnabled?: boolean | null
  account?: { encrypted_token: string; status: string } | null
  /** false → simula tabela conversion_events inexistente (erro PGRST205). */
  conversionEventsExists?: boolean
}

interface Captured {
  conversionInserts: Record<string, unknown>[]
}

function makeSupabase(config: SupaConfig, captured: Captured) {
  const ceExists = config.conversionEventsExists !== false

  function from(table: string) {
    if (table === 'workspace_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                meta_pixel_id: config.pixelId ?? null,
                meta_conversions_api_enabled: config.capiEnabled ?? null,
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'ad_accounts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: config.account ?? null, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'conversion_events') {
      if (!ceExists) {
        // head select usado por conversionEventsExists() → erro de relação inexistente.
        return {
          select: () => ({
            limit: async () => ({ data: null, error: { code: 'PGRST205' } }),
          }),
          insert: () => ({
            select: () => ({ single: async () => ({ data: null, error: { code: 'PGRST205' } }) }),
          }),
        }
      }
      return {
        select: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
        insert: (row: Record<string, unknown>) => {
          captured.conversionInserts.push(row)
          return {
            select: () => ({
              single: async () => ({ data: { id: 'ce-1' }, error: null }),
            }),
          }
        },
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ events_received: 1 }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.META_TEST_EVENT_CODE
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── buildUserData — gate de consentimento por fonte (AC 8.7.2) ───────────────

describe('buildUserData — gate de consentimento por fonte', () => {
  it('[CRÍTICO] landing_page SEM consent → user_data.em AUSENTE', () => {
    const lead = makeLead({
      source: 'landing_page',
      consent_given_at: null,
      email_encrypted: encryptedEmail(),
    })
    const ud = buildUserData(lead, KEY)
    expect(ud.ph).toEqual(['hmac-phone-hash-abc'])
    expect(ud.em).toBeUndefined()
  })

  it('[CRÍTICO] landing_page COM consent → user_data.em PRESENTE', () => {
    const lead = makeLead({
      source: 'landing_page',
      consent_given_at: '2026-06-30T00:00:00Z',
      email_encrypted: encryptedEmail(),
    })
    const ud = buildUserData(lead, KEY)
    expect(ud.em).toEqual([EXPECTED_EM])
  })

  it('lead_ads → user_data.em SEMPRE PRESENTE (sem gate de consent)', () => {
    const lead = makeLead({
      source: 'lead_ads',
      consent_given_at: null, // irrelevante para lead_ads
      email_encrypted: encryptedEmail(),
      meta_lead_id: 'meta-lead-99',
    })
    const ud = buildUserData(lead, KEY)
    expect(ud.em).toEqual([EXPECTED_EM])
  })

  it('lead_ads → user_data.lead_id = meta_lead_id', () => {
    const lead = makeLead({
      source: 'lead_ads',
      email_encrypted: encryptedEmail(),
      meta_lead_id: 'meta-lead-99',
    })
    const ud = buildUserData(lead, KEY)
    expect(ud.lead_id).toBe('meta-lead-99')
  })

  it('landing_page nunca recebe lead_id mesmo com meta_lead_id', () => {
    const lead = makeLead({
      source: 'landing_page',
      consent_given_at: '2026-06-30T00:00:00Z',
      email_encrypted: encryptedEmail(),
      meta_lead_id: 'should-not-leak',
    })
    const ud = buildUserData(lead, KEY)
    expect(ud.lead_id).toBeUndefined()
  })

  it('sem email_encrypted → só ph, nunca em', () => {
    const lead = makeLead({ source: 'lead_ads', email_encrypted: null })
    const ud = buildUserData(lead, KEY)
    expect(ud.em).toBeUndefined()
    expect(ud.ph).toEqual(['hmac-phone-hash-abc'])
  })
})

// ── buildCapiPayload — event_id e shape (AC 8.7.1, 8.7.6) ────────────────────

describe('buildCapiPayload', () => {
  it('event_id = lead.id e action_source = website', () => {
    const lead = makeLead({ id: 'lead-uuid-xyz' })
    const payload = buildCapiPayload(lead, 'Lead', KEY)
    expect(payload.event_id).toBe('lead-uuid-xyz')
    expect(payload.event_name).toBe('Lead')
    expect(payload.action_source).toBe('website')
    expect(typeof payload.event_time).toBe('number')
  })
})

// ── checkCAPIGate (AC 8.7.3) ─────────────────────────────────────────────────

describe('checkCAPIGate', () => {
  it('meta_conversions_api_enabled=false → enabled=false (capi_disabled)', async () => {
    const supabase = makeSupabase(
      { pixelId: 'PIX', capiEnabled: false },
      { conversionInserts: [] }
    )
    const gate = await checkCAPIGate('ws-1', null, supabase, KEY)
    expect(gate.enabled).toBe(false)
    expect(gate.skipReason).toBe('capi_disabled')
  })

  it('sem meta_pixel_id → enabled=false (no_pixel_id)', async () => {
    const supabase = makeSupabase({ pixelId: null }, { conversionInserts: [] })
    const gate = await checkCAPIGate('ws-1', null, supabase, KEY)
    expect(gate.enabled).toBe(false)
    expect(gate.skipReason).toBe('no_pixel_id')
  })

  it('conta expirada → enabled=false (token_expired)', async () => {
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'expired' } },
      { conversionInserts: [] }
    )
    const gate = await checkCAPIGate('ws-1', 'acc-1', supabase, KEY)
    expect(gate.enabled).toBe(false)
    expect(gate.skipReason).toBe('token_expired')
  })

  it('conta ativa → enabled=true com token descriptografado', async () => {
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('plain-token', KEY), status: 'active' } },
      { conversionInserts: [] }
    )
    const gate = await checkCAPIGate('ws-1', 'acc-1', supabase, KEY)
    expect(gate.enabled).toBe(true)
    expect(gate.pixelId).toBe('PIX')
    expect(gate.token).toBe('plain-token')
  })
})

// ── sendLeadCapi / dispatch (AC 8.7.3-8.7.6) ─────────────────────────────────

describe('sendLeadCapi — gate de envio e disparo', () => {
  it('gate não satisfeito (pixel ausente) → status=skipped, CAPI NÃO chamado', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase({ pixelId: null }, captured)
    const lead = makeLead({ source: 'lead_ads', email_encrypted: encryptedEmail() })

    const result = await sendLeadCapi(lead, 'acc-1', supabase, KEY)

    expect(result.status).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
    // conversion_events registra o skip para auditoria.
    expect(captured.conversionInserts).toHaveLength(1)
    expect(captured.conversionInserts[0].status).toBe('skipped')
  })

  it('gate satisfeito → POST à Graph API e status=sent', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    const lead = makeLead({
      source: 'lead_ads',
      email_encrypted: encryptedEmail(),
      meta_lead_id: 'm-1',
    })

    const result = await sendLeadCapi(lead, 'acc-1', supabase, KEY)

    expect(result.status).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/PIX/events')
    expect(url).toContain('access_token=tok')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data[0].event_name).toBe('Lead')
    expect(body.data[0].user_data.em).toEqual([EXPECTED_EM])
    expect(body.data[0].user_data.lead_id).toBe('m-1')
  })

  it('Meta retorna erro HTTP → status=failed sem vazar PII na mensagem', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid parameter' } }),
    } as unknown as Response)
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    const lead = makeLead({ source: 'lead_ads', email_encrypted: encryptedEmail() })

    const result = await sendLeadCapi(lead, 'acc-1', supabase, KEY)
    expect(result.status).toBe('failed')
    expect(result.message).toBe('Invalid parameter')
    expect(result.message).not.toContain('@')
  })

  it('test_event_code incluído no body quando META_TEST_EVENT_CODE setado', async () => {
    process.env.META_TEST_EVENT_CODE = 'TEST123'
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    const lead = makeLead({ source: 'lead_ads', email_encrypted: encryptedEmail() })

    await sendLeadCapi(lead, 'acc-1', supabase, KEY)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.test_event_code).toBe('TEST123')
  })

  it('conversion_events inexistente → não quebra, skip apenas logado', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: null, conversionEventsExists: false },
      captured
    )
    const lead = makeLead({ source: 'landing_page' })

    const result = await sendLeadCapi(lead, null, supabase, KEY)
    expect(result.status).toBe('skipped')
    // tabela não existe → nenhum insert persistido.
    expect(captured.conversionInserts).toHaveLength(0)
  })
})

// ── sendCompleteRegistrationCapi (AC 8.7.5) ─────────────────────────────────

describe('sendCompleteRegistrationCapi', () => {
  it('mesmo gate por fonte; event_name = CompleteRegistration', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    // landing_page COM consent → em presente.
    const lead = makeLead({
      source: 'landing_page',
      consent_given_at: '2026-06-30T00:00:00Z',
      email_encrypted: encryptedEmail(),
    })

    const result = await sendCompleteRegistrationCapi(lead, 'acc-1', supabase, KEY)
    expect(result.status).toBe('sent')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data[0].event_name).toBe('CompleteRegistration')
    expect(body.data[0].user_data.em).toEqual([EXPECTED_EM])
  })

  it('[CRÍTICO] landing_page SEM consent → CompleteRegistration sem em', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    const lead = makeLead({
      source: 'landing_page',
      consent_given_at: null,
      email_encrypted: encryptedEmail(),
    })

    await sendCompleteRegistrationCapi(lead, 'acc-1', supabase, KEY)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data[0].user_data.em).toBeUndefined()
  })
})

// ── SHA256 não persiste (AC 8.7.2) ───────────────────────────────────────────

describe('SHA256(email) nunca é persistido', () => {
  it('nenhum insert/update em conversion_events grava o hash de email nem o plaintext', async () => {
    const captured: Captured = { conversionInserts: [] }
    const supabase = makeSupabase(
      { pixelId: 'PIX', account: { encrypted_token: encryptToken('tok', KEY), status: 'active' } },
      captured
    )
    const lead = makeLead({ source: 'lead_ads', email_encrypted: encryptedEmail() })

    await sendLeadCapi(lead, 'acc-1', supabase, KEY)

    // O registro pending NÃO contém o hash de email nem o email em texto plano.
    for (const row of captured.conversionInserts) {
      const serialized = JSON.stringify(row)
      expect(serialized).not.toContain(EXPECTED_EM)
      expect(serialized.toLowerCase()).not.toContain('lead@example.com')
    }
    // O hash só aparece dentro do body enviado à Meta (em memória), não na persistência.
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).body as string).toContain(EXPECTED_EM)
  })
})
