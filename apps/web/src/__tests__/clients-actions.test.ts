import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientSchema } from '@/lib/schemas/clients'

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { createClient, updateClient, archiveClient } from '@/app/actions/clients'

const mockRedirect = vi.mocked(redirect)

// ── Helpers ────────────────────────────────────────────────────────

function mockSupabase({
  user = { id: 'user-1' },
  membership = { workspace_id: 'ws-1' },
  insertError = null,
  updateError = null,
}: {
  user?: { id: string } | null
  membership?: { workspace_id: string } | null
  insertError?: string | null
  updateError?: string | null
} = {}) {
  const single = vi.fn()

  const mockClient = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: single,
    }),
  }

  single
    .mockResolvedValueOnce({ data: membership, error: null })     // workspace_members query
    .mockResolvedValueOnce({ data: null, error: insertError ? { message: insertError } : null })  // insert/update

  if (insertError) {
    mockClient.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: membership, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: insertError } }),
    })
  }

  vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as never)
  return mockClient
}

// ── ClientSchema ───────────────────────────────────────────────────

describe('ClientSchema', () => {
  it('valida nome obrigatório', () => {
    const result = ClientSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Nome obrigatório')
    }
  })

  it('aceita dados válidos completos', () => {
    const result = ClientSchema.safeParse({
      name: 'Agência Crescimento',
      document: '12345678000190',
      contact_email: 'contato@agencia.com.br',
      contact_phone: '11999999999',
    })
    expect(result.success).toBe(true)
  })

  it('aceita dados com somente nome (campos opcionais vazios)', () => {
    const result = ClientSchema.safeParse({ name: 'Cliente Mínimo' })
    expect(result.success).toBe(true)
  })

  it('rejeita email inválido', () => {
    const result = ClientSchema.safeParse({
      name: 'Cliente',
      contact_email: 'nao-e-um-email',
    })
    expect(result.success).toBe(false)
  })

  it('aceita contact_email vazio (string vazia = sem email)', () => {
    const result = ClientSchema.safeParse({
      name: 'Cliente',
      contact_email: '',
    })
    expect(result.success).toBe(true)
  })
})

// ── createClient ───────────────────────────────────────────────────

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  })

  it('redireciona para /login se usuário não autenticado', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      }),
    }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as never)

    await expect(
      createClient({ name: 'Cliente Teste' })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redireciona para /onboarding se usuário sem workspace', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as never)

    await expect(
      createClient({ name: 'Cliente Teste' })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding')
  })
})

// ── archiveClient ──────────────────────────────────────────────────

describe('archiveClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  })

  it('retorna erro se operação falha', async () => {
    const single = vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-1' }, error: null })
    const updateResult = { error: { message: 'DB error' } }
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnValue(updateResult),
        single,
      }),
    }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as never)

    const result = await archiveClient('client-id')
    expect(result).toEqual({ error: 'Erro ao arquivar cliente.' })
  })
})
