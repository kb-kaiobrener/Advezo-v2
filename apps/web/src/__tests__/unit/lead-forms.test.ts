import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LeadFormField } from '@advezo/types'

/**
 * Testes unitários — CRUD de lead_forms (Story 8.2 — AC 8.2.1 a 8.2.4).
 *
 * Cenários (conforme story):
 *  1. POST com body válido (sem email) → 201, embed_token presente, is_active=true.
 *  2. POST com campo email SEM consent_checkbox → 422 com mensagem LGPD literal.
 *  3. POST com campo email COM consent_checkbox linked_field:'email' → 201 (aceito).
 *  4. GET /:id/embed → snippet contém `form.js?token=` + embed_token correto.
 *  5. DELETE /:id → is_active=false (soft delete; NÃO remove fisicamente).
 *
 * `@advezo/database` é mockado por teste (vi.doMock + vi.resetModules), espelhando o
 * encadeamento real do supabase-js usado por cada handler. crypto NÃO é mockado — o
 * embed_token é gerado de verdade (randomBytes), validando a presença/formato real.
 */

const AUTHED_USER = {
  data: { user: { id: 'user-1', user_metadata: { workspace_id: 'ws-1' } } },
}

interface InsertCapture {
  payload?: Record<string, unknown>
}

/**
 * Mock do client para o handler POST: auth.getUser autenticado + from('lead_forms')
 * com insert().select().single(). `insertResult` decide o retorno (sucesso ou erro).
 */
function mockServerClientForInsert(
  capture: InsertCapture,
  insertResult: (payload: Record<string, unknown>) => {
    data: unknown
    error: { code?: string; message?: string } | null
  }
) {
  return {
    auth: { getUser: async () => AUTHED_USER },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        capture.payload = payload
        return {
          select: () => ({
            single: async () => insertResult(payload),
          }),
        }
      },
    }),
  }
}

const emailField: LeadFormField = {
  id: 'f-email',
  type: 'email',
  label: 'E-mail',
  required: true,
  fixed: false,
}

const consentField: LeadFormField = {
  id: 'f-consent',
  type: 'consent_checkbox',
  label: 'Aceito receber contato',
  required: true,
  fixed: false,
  linked_field: 'email',
}

const nameField: LeadFormField = {
  id: 'f-name',
  type: 'text',
  label: 'Nome',
  required: true,
  fixed: true,
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/lead-forms', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const CLIENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

describe('POST /api/lead-forms (Story 8.2)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('1. body válido sem email → 201, embed_token presente, is_active=true', async () => {
    const capture: InsertCapture = {}
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () =>
        mockServerClientForInsert(capture, (payload) => ({
          // O banco devolveria a linha inserida; espelhamos o payload + id.
          data: { id: 'form-1', ...payload },
          error: null,
        }))
      ),
    }))

    const { POST } = await import('@/app/api/lead-forms/route')
    const res = await POST(
      postRequest({ name: 'Meu Formulário', client_id: CLIENT_ID, fields: [nameField] })
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.embed_token).toBeTruthy()
    expect(typeof json.embed_token).toBe('string')
    expect(json.is_active).toBe(true)
    // Slug derivado do nome (lowercase, kebab-case, sem acentos).
    expect(json.slug).toBe('meu-formulario')
    // embed_token de fato gerado (não vazio, base64url 128 bits → ~22 chars).
    expect(capture.payload?.embed_token).toBeTruthy()
    expect((capture.payload?.embed_token as string).length).toBeGreaterThanOrEqual(20)
  })

  it('2. campo email SEM consent_checkbox → 422 com mensagem LGPD', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: { getUser: async () => AUTHED_USER },
        from: () => ({
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        }),
      })),
    }))

    const { POST } = await import('@/app/api/lead-forms/route')
    const res = await POST(
      postRequest({ name: 'Form Email', client_id: CLIENT_ID, fields: [emailField] })
    )

    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe(
      'Formulário com campo email requer consent_checkbox vinculado (LGPD Art. 7º I)'
    )
  })

  it('3. campo email COM consent_checkbox linked_field:email → 201 (aceito)', async () => {
    const capture: InsertCapture = {}
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () =>
        mockServerClientForInsert(capture, (payload) => ({
          data: { id: 'form-2', ...payload },
          error: null,
        }))
      ),
    }))

    const { POST } = await import('@/app/api/lead-forms/route')
    const res = await POST(
      postRequest({
        name: 'Form com consentimento',
        client_id: CLIENT_ID,
        fields: [emailField, consentField],
      })
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.embed_token).toBeTruthy()
    // Os dois campos foram persistidos.
    expect((capture.payload?.fields as LeadFormField[])).toHaveLength(2)
  })

  it('401 quando não autenticado', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
        from: () => ({}),
      })),
    }))

    const { POST } = await import('@/app/api/lead-forms/route')
    const res = await POST(postRequest({ name: 'X', client_id: CLIENT_ID }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/lead-forms/:id/embed (Story 8.2 — AC 8.2.4)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('4. retorna snippet com form.js?token= e o embed_token correto', async () => {
    const token = 'abc123token_base64url'
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: { getUser: async () => AUTHED_USER },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { embed_token: token, name: 'Form' },
                error: null,
              }),
            }),
          }),
        }),
      })),
    }))

    const { GET } = await import('@/app/api/lead-forms/[id]/embed/route')
    const res = await GET(new Request('http://localhost:3000/api/lead-forms/form-1/embed'), {
      params: Promise.resolve({ id: 'form-1' }),
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.embed_token).toBe(token)
    expect(json.snippet).toContain('form.js?token=')
    expect(json.snippet).toContain(token)
    expect(json.snippet).toBe(
      `<script src="https://app.advezo.com.br/embed/form.js?token=${token}"></script>`
    )
    expect(json.instructions).toBeTruthy()
  })
})

describe('DELETE /api/lead-forms/:id (Story 8.2 — soft delete)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('5. marca is_active=false via UPDATE (não DELETE físico)', async () => {
    const updatePayloads: Record<string, unknown>[] = []
    let deleteWasCalled = false

    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: { getUser: async () => AUTHED_USER },
        from: () => ({
          update: (payload: Record<string, unknown>) => {
            updatePayloads.push(payload)
            return {
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'form-1', is_active: false },
                    error: null,
                  }),
                }),
              }),
            }
          },
          delete: () => {
            deleteWasCalled = true
            return { eq: async () => ({ error: null }) }
          },
        }),
      })),
    }))

    const { DELETE } = await import('@/app/api/lead-forms/[id]/route')
    const res = await DELETE(
      new Request('http://localhost:3000/api/lead-forms/form-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'form-1' }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.is_active).toBe(false)
    // É soft-delete: usou UPDATE is_active=false e NÃO chamou delete físico.
    expect(updatePayloads).toEqual([{ is_active: false }])
    expect(deleteWasCalled).toBe(false)
  })
})
