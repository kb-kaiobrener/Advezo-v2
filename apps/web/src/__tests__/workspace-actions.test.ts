import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock @advezo/database
vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'

const mockRedirect = vi.mocked(redirect)
const mockCreateClient = vi.mocked(createSupabaseServerClient)

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    ...overrides,
  }
}

describe('createWorkspace server action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login if user is not authenticated', async () => {
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    const supabase = makeSupabaseMock()
    ;(supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null } })
    mockCreateClient.mockResolvedValue(supabase as never)

    const { createWorkspace } = await import('@/app/actions/workspace')
    const formData = new FormData()
    formData.set('name', 'Test Workspace')
    await expect(createWorkspace(formData)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /dashboard if workspace already exists', async () => {
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    const supabase = makeSupabaseMock()
    const chainMock = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-1' }, error: null }),
    }
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chainMock)
    mockCreateClient.mockResolvedValue(supabase as never)

    const { createWorkspace } = await import('@/app/actions/workspace')
    const formData = new FormData()
    formData.set('name', 'Test Workspace')
    await expect(createWorkspace(formData)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })
})

describe('useWorkspaceStore', () => {
  it('sets workspace data correctly', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace')
    const store = useWorkspaceStore.getState()

    store.setWorkspace({ id: 'ws-123', name: 'Minha Agência', role: 'owner' })

    const state = useWorkspaceStore.getState()
    expect(state.workspaceId).toBe('ws-123')
    expect(state.workspaceName).toBe('Minha Agência')
    expect(state.role).toBe('owner')
  })

  it('clears workspace data', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace')
    const store = useWorkspaceStore.getState()

    store.setWorkspace({ id: 'ws-123', name: 'Workspace', role: 'owner' })
    store.clearWorkspace()

    const state = useWorkspaceStore.getState()
    expect(state.workspaceId).toBeNull()
    expect(state.workspaceName).toBeNull()
    expect(state.role).toBeNull()
  })
})
