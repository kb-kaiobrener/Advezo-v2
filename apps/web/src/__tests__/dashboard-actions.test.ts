import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import {
  saveDashboardConfig,
  deactivateDashboard,
  uploadDashboardLogo,
} from '@/app/actions/dashboard'

const mockCreateServerClient = vi.mocked(createSupabaseServerClient)
const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServerClient(userId: string | null = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  }
}

function membershipChain(workspaceId: string | null = 'ws-1') {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: workspaceId ? { workspace_id: workspaceId } : null,
      error: null,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DASHBOARD_AUTH_SECRET = 'test-secret-hex'
})

// ── saveDashboardConfig ───────────────────────────────────────────────────────

describe('saveDashboardConfig', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await saveDashboardConfig('client-1', { selected_metrics: ['spend'] })
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('cria config nova sem token existente (deixa o DEFAULT gerar) e retorna o token', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const existingLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const upsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { token: 'generated-token' }, error: null }),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        count += 1
        if (count === 1) return membershipChain()
        if (count === 2) return existingLookup
        return upsertChain
      }),
    } as never)

    const result = await saveDashboardConfig('client-1', {
      selected_metrics: ['spend', 'clicks'],
    })

    expect(result).toEqual({ success: true, token: 'generated-token' })
    // upsert por conflito workspace_id,client_id
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        client_id: 'client-1',
        selected_metrics: ['spend', 'clicks'],
        is_active: true,
        password_hash: null,
        password_salt: null,
      }),
      { onConflict: 'workspace_id,client_id' }
    )
    // sem token na primeira criação (o DEFAULT da migration gera)
    expect(upsertChain.upsert.mock.calls[0][0]).not.toHaveProperty('token')
  })

  it('preserva o token existente em re-save (não gera novo)', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const existingLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { token: 'existing-token' }, error: null }),
    }
    const upsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { token: 'existing-token' }, error: null }),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        count += 1
        if (count === 1) return membershipChain()
        if (count === 2) return existingLookup
        return upsertChain
      }),
    } as never)

    const result = await saveDashboardConfig('client-1', { selected_metrics: ['spend'] })

    expect(result).toEqual({ success: true, token: 'existing-token' })
    expect(upsertChain.upsert.mock.calls[0][0]).toMatchObject({ token: 'existing-token' })
  })

  it('gera password_hash e password_salt quando senha é fornecida', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const existingLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const upsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { token: 't' }, error: null }),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        count += 1
        if (count === 1) return membershipChain()
        if (count === 2) return existingLookup
        return upsertChain
      }),
    } as never)

    await saveDashboardConfig('client-1', { selected_metrics: ['spend'], password: 'segredo' })

    const row = upsertChain.upsert.mock.calls[0][0] as {
      password_hash: string | null
      password_salt: string | null
    }
    expect(row.password_hash).toBeTypeOf('string')
    expect(row.password_salt).toBeTypeOf('string')
    expect(row.password_hash).toHaveLength(64) // SHA-256 hex
  })

  it('retorna erro quando o upsert falha', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const existingLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const upsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        count += 1
        if (count === 1) return membershipChain()
        if (count === 2) return existingLookup
        return upsertChain
      }),
    } as never)

    const result = await saveDashboardConfig('client-1', { selected_metrics: ['spend'] })
    expect(result).toEqual({ error: 'Erro ao salvar configuração do dashboard' })
  })
})

// ── deactivateDashboard ───────────────────────────────────────────────────────

describe('deactivateDashboard', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const result = await deactivateDashboard('client-1')
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('seta is_active=false escopado por workspace e client', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(res),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => (count++ === 0 ? membershipChain() : updateChain)),
    } as never)

    const result = await deactivateDashboard('client-1')

    expect(result).toEqual({ success: true })
    expect(updateChain.update).toHaveBeenCalledWith({ is_active: false })
    expect(updateChain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(updateChain.eq).toHaveBeenCalledWith('client_id', 'client-1')
  })
})

// ── uploadDashboardLogo ───────────────────────────────────────────────────────

function pngFile(sizeBytes: number, type = 'image/png') {
  const file = new File([new Uint8Array(Math.max(sizeBytes, 0))], 'logo.png', { type })
  return file
}

describe('uploadDashboardLogo', () => {
  it('retorna erro se usuário não autenticado', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient(null) as never)
    mockCreateServiceClient.mockReturnValue({} as never)

    const fd = new FormData()
    fd.append('logo', pngFile(10))
    const result = await uploadDashboardLogo('client-1', fd)
    expect(result).toEqual({ error: 'Não autenticado' })
  })

  it('rejeita arquivo acima de 2MB', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => membershipChain()),
    } as never)

    const fd = new FormData()
    fd.append('logo', pngFile(2 * 1024 * 1024 + 1))
    const result = await uploadDashboardLogo('client-1', fd)
    expect(result).toEqual({ error: 'Logo excede o tamanho máximo de 2MB' })
  })

  it('rejeita mime inválido', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => membershipChain()),
    } as never)

    const fd = new FormData()
    fd.append('logo', pngFile(10, 'image/gif'))
    const result = await uploadDashboardLogo('client-1', fd)
    expect(result).toEqual({ error: 'Formato inválido — use PNG ou JPEG' })
  })

  it('faz upload, obtém URL pública e persiste logo_url', async () => {
    mockCreateServerClient.mockResolvedValue(makeServerClient() as never)

    const uploadFn = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null })
    const getPublicUrlFn = vi
      .fn()
      .mockReturnValue({ data: { publicUrl: 'https://cdn/logo.png' } })
    const storageFrom = vi.fn().mockReturnValue({ upload: uploadFn, getPublicUrl: getPublicUrlFn })

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(res),
    }

    let count = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => (count++ === 0 ? membershipChain() : updateChain)),
      storage: { from: storageFrom },
    } as never)

    const fd = new FormData()
    fd.append('logo', pngFile(100))
    const result = await uploadDashboardLogo('client-1', fd)

    expect(result).toEqual({ success: true, logoUrl: 'https://cdn/logo.png' })
    expect(storageFrom).toHaveBeenCalledWith('dashboard-logos')
    expect(uploadFn).toHaveBeenCalledWith(
      'ws-1/client-1/logo.png',
      expect.any(Buffer),
      expect.objectContaining({ upsert: true })
    )
    expect(updateChain.update).toHaveBeenCalledWith({ logo_url: 'https://cdn/logo.png' })
  })
})
