import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QualificationRule } from '@advezo/types'
import { evaluateQualificationRules } from '@/lib/leads/qualification'

/**
 * Testes unitários — Story 8.4 (motor de qualificação + Server Actions de status).
 *
 * Parte 1 (motor, função pura): os 5 operadores (eq, not_eq, contains, filled,
 * not_filled), AND-logic com múltiplas regras e o caso de array vazio (→ false).
 *
 * Parte 2 (Server Actions): transições válidas/inválidas, status terminal `convertido`,
 * guard de autenticação, revalidatePath e bulkUpdate com falha parcial. O Supabase e o
 * next/cache são mockados; o CAPI é stub (não verificado no transporte).
 */

// ──────────────────────────────────────────────────────────────
// Parte 1 — Motor de qualificação (AC 8.4.1)
// ──────────────────────────────────────────────────────────────

const rule = (
  field: string,
  operator: QualificationRule['operator'],
  value: string | null = null
): QualificationRule => ({ field, operator, value })

describe('evaluateQualificationRules (Story 8.4 — AC 8.4.1)', () => {
  it('eq: campo igual ao valor → true', () => {
    expect(evaluateQualificationRules({ q1: 'Sim' }, [rule('q1', 'eq', 'Sim')])).toBe(
      true
    )
  })

  it('eq: campo diferente do valor → false', () => {
    expect(evaluateQualificationRules({ q1: 'Não' }, [rule('q1', 'eq', 'Sim')])).toBe(
      false
    )
  })

  it('eq: compara por string (número 10 == "10")', () => {
    expect(evaluateQualificationRules({ n: 10 }, [rule('n', 'eq', '10')])).toBe(true)
  })

  it('not_eq: campo diferente do valor → true', () => {
    expect(
      evaluateQualificationRules({ q1: 'Sim' }, [rule('q1', 'not_eq', 'Não')])
    ).toBe(true)
  })

  it('not_eq: campo igual ao valor → false', () => {
    expect(
      evaluateQualificationRules({ q1: 'Não' }, [rule('q1', 'not_eq', 'Não')])
    ).toBe(false)
  })

  it('contains: string inclui o valor → true', () => {
    expect(
      evaluateQualificationRules({ msg: 'Preciso urgente' }, [
        rule('msg', 'contains', 'urgente'),
      ])
    ).toBe(true)
  })

  it('contains: string não inclui o valor → false', () => {
    expect(
      evaluateQualificationRules({ msg: 'Sem pressa' }, [
        rule('msg', 'contains', 'urgente'),
      ])
    ).toBe(false)
  })

  it('contains: campo não-string → false (não lança)', () => {
    expect(
      evaluateQualificationRules({ msg: 42 }, [rule('msg', 'contains', 'urgente')])
    ).toBe(false)
  })

  it('filled: campo presente e não vazio → true', () => {
    expect(evaluateQualificationRules({ nome: 'Ana' }, [rule('nome', 'filled')])).toBe(
      true
    )
  })

  it('filled: string vazia → false', () => {
    expect(evaluateQualificationRules({ nome: '' }, [rule('nome', 'filled')])).toBe(
      false
    )
  })

  it('filled: campo ausente → false', () => {
    expect(evaluateQualificationRules({}, [rule('nome', 'filled')])).toBe(false)
  })

  it('filled: campo null → false', () => {
    expect(
      evaluateQualificationRules({ nome: null }, [rule('nome', 'filled')])
    ).toBe(false)
  })

  it('not_filled: campo ausente → true', () => {
    expect(evaluateQualificationRules({}, [rule('extra', 'not_filled')])).toBe(true)
  })

  it('not_filled: string vazia → true', () => {
    expect(
      evaluateQualificationRules({ extra: '' }, [rule('extra', 'not_filled')])
    ).toBe(true)
  })

  it('not_filled: campo preenchido → false', () => {
    expect(
      evaluateQualificationRules({ extra: 'x' }, [rule('extra', 'not_filled')])
    ).toBe(false)
  })

  it('AND-logic: todas as regras passam → true', () => {
    expect(
      evaluateQualificationRules({ q1: 'Sim', msg: 'urgente agora' }, [
        rule('q1', 'eq', 'Sim'),
        rule('msg', 'contains', 'urgente'),
      ])
    ).toBe(true)
  })

  it('AND-logic: primeira passa, segunda falha → false', () => {
    expect(
      evaluateQualificationRules({ q1: 'Sim', msg: 'sem pressa' }, [
        rule('q1', 'eq', 'Sim'),
        rule('msg', 'contains', 'urgente'),
      ])
    ).toBe(false)
  })

  it('array de regras vazio → false (sem qualificação automática)', () => {
    expect(evaluateQualificationRules({ q1: 'Sim' }, [])).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────
// Parte 2 — Server Actions de status (AC 8.4.3 / 8.4.4)
// ──────────────────────────────────────────────────────────────

const revalidatePath = vi.fn()

interface ActionMockConfig {
  /** Usuário autenticado (null → Unauthorized). */
  user?: { id: string } | null
  /** Linha de lead devolvida pelo select().single() (null → não encontrado). */
  lead?: { status: string } | null
  /** Erro a devolver no UPDATE. */
  updateError?: { message?: string } | null
}

/** Captura o payload do UPDATE para asserts (qualified_at/converted_at). */
interface UpdateCapture {
  payload: Record<string, unknown> | null
}

function createSupabaseMock(config: ActionMockConfig, capture: UpdateCapture) {
  return {
    auth: {
      getUser: async () => ({ data: { user: config.user ?? null }, error: null }),
    },
    from(table: string) {
      if (table !== 'leads') throw new Error(`unexpected table ${table}`)
      return {
        // select(...).eq('id', x).single()
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: config.lead
                ? {
                    status: config.lead.status,
                    phone_hash: 'hash',
                    email_encrypted: null,
                    consent_given_at: null,
                    client_id: 'client-1',
                  }
                : null,
              error: config.lead ? null : { message: 'not found' },
            }),
          }),
        }),
        // update(payload).eq('id', x)
        update: (payload: Record<string, unknown>) => {
          capture.payload = payload
          return {
            eq: async () => ({ error: config.updateError ?? null }),
          }
        },
      }
    },
  }
}

async function loadActions(config: ActionMockConfig, capture: UpdateCapture) {
  revalidatePath.mockClear()
  vi.doMock('next/cache', () => ({ revalidatePath }))
  vi.doMock('@advezo/database', () => ({
    createSupabaseServerClient: vi.fn(async () => createSupabaseMock(config, capture)),
  }))
  return import('@/app/actions/leads')
}

describe('updateLeadStatus (Story 8.4 — AC 8.4.3 / 8.4.7)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('next/cache')
    vi.doUnmock('@advezo/database')
  })

  it('sem usuário autenticado → { error: "Unauthorized" }', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions({ user: null }, capture)
    const result = await updateLeadStatus('lead-1', 'qualificado')
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('transição válida novo→qualificado → {} + qualified_at + revalidatePath', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: { status: 'novo' } },
      capture
    )
    const result = await updateLeadStatus('lead-1', 'qualificado')
    expect(result).toEqual({})
    expect(capture.payload?.status).toBe('qualificado')
    expect(capture.payload?.qualified_at).toBeDefined()
    expect(revalidatePath).toHaveBeenCalledWith('/leads')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('transição válida qualificado→convertido → {} + converted_at', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: { status: 'qualificado' } },
      capture
    )
    const result = await updateLeadStatus('lead-1', 'convertido')
    expect(result).toEqual({})
    expect(capture.payload?.converted_at).toBeDefined()
  })

  it('transição válida desqualificado→novo (re-aquisição) → {}', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: { status: 'desqualificado' } },
      capture
    )
    expect(await updateLeadStatus('lead-1', 'novo')).toEqual({})
  })

  it('lead convertido (terminal) → { error: "status_convertido_terminal" }', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: { status: 'convertido' } },
      capture
    )
    const result = await updateLeadStatus('lead-1', 'qualificado')
    expect(result).toEqual({ error: 'status_convertido_terminal' })
    expect(capture.payload).toBeNull() // nenhum UPDATE disparado
  })

  it('transição inválida novo→convertido → erro de transição', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: { status: 'novo' } },
      capture
    )
    const result = await updateLeadStatus('lead-1', 'convertido')
    expect(result.error).toContain('não permitida')
    expect(capture.payload).toBeNull()
  })

  it('lead não encontrado → { error: "Lead não encontrado" }', async () => {
    const capture: UpdateCapture = { payload: null }
    const { updateLeadStatus } = await loadActions(
      { user: { id: 'u1' }, lead: null },
      capture
    )
    expect(await updateLeadStatus('lead-x', 'qualificado')).toEqual({
      error: 'Lead não encontrado',
    })
  })
})

describe('bulkUpdateLeadStatus (Story 8.4 — AC 8.4.4)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('next/cache')
    vi.doUnmock('@advezo/database')
  })

  it('lista vazia → { updated: 0, errors: [] }', async () => {
    const capture: UpdateCapture = { payload: null }
    const { bulkUpdateLeadStatus } = await loadActions(
      { user: { id: 'u1' } },
      capture
    )
    expect(await bulkUpdateLeadStatus([], 'qualificado')).toEqual({
      updated: 0,
      errors: [],
    })
  })

  it('falha parcial: 1 lead convertido (terminal) entre 3 → { updated: 2, errors: [1] }', async () => {
    // Mock dinâmico por leadId: lead-2 é convertido (falha), os outros são 'novo'.
    revalidatePath.mockClear()
    vi.doMock('next/cache', () => ({ revalidatePath }))
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
        },
        from() {
          let requestedId = ''
          return {
            select: () => ({
              eq: (_col: string, id: string) => {
                requestedId = id
                return {
                  single: async () => ({
                    data: {
                      status: requestedId === 'lead-2' ? 'convertido' : 'novo',
                      phone_hash: 'h',
                      email_encrypted: null,
                      consent_given_at: null,
                      client_id: 'c1',
                    },
                    error: null,
                  }),
                }
              },
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          }
        },
      })),
    }))
    const { bulkUpdateLeadStatus } = await import('@/app/actions/leads')

    const result = await bulkUpdateLeadStatus(
      ['lead-1', 'lead-2', 'lead-3'],
      'qualificado'
    )
    expect(result.updated).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('lead-2')
    expect(result.errors[0]).toContain('status_convertido_terminal')
  })
})
