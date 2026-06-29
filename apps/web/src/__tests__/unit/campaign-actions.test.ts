import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken } from '@advezo/utils'

/**
 * Testes unitários — Ações inline de campanha (Story 2.7 — AC 2.7.9).
 *
 * Cobre os 3 cenários obrigatórios da story:
 *  a) Pause bem-sucedido (Meta): API retorna success → action_log status='success'
 *     + ad_campaigns.status='paused' (AC 2.7.4).
 *  b) Pause com falha de API: API retorna erro → action_log status='failed' +
 *     ad_campaigns NÃO é atualizado — estado local preservado (AC 2.7.3 / 2.7.8).
 *  c) Ownership check: campaignId de outro workspace → a query .eq('workspace_id')
 *     não encontra a campanha → retorna erro SEM inserir action_log nem chamar a API
 *     (AC 2.7.6).
 *
 * NÃO mockamos decryptToken/encryptToken — usamos a implementação real de
 * @advezo/utils (token de fato criptografado/descriptografado), espelhando
 * sync-meta.test.ts. action_log e ad_campaigns são observados via lista de calls.
 */

const VALID_KEY = 'a'.repeat(64) // 64 hex chars = 32 bytes

interface MockCall {
  table: string
  op: 'select' | 'insert' | 'update'
  payload?: unknown
}

interface MockOptions {
  /** Linha de campanha retornada pelo fetch (null simula ownership negada). */
  campaignRow: Record<string, unknown> | null
}

function createSupabaseMock(opts: MockOptions) {
  const calls: MockCall[] = []

  function from(table: string) {
    const builder: Record<string, unknown> = {}

    builder.select = () => {
      calls.push({ table, op: 'select' })

      // workspace_members: select → eq → single
      if (table === 'workspace_members') {
        return {
          eq: () => ({
            single: async () => ({ data: { workspace_id: 'ws-1' }, error: null }),
          }),
        }
      }

      // ad_campaigns: select → eq → eq → single  (ownership via 2º .eq)
      return {
        eq: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.campaignRow,
              error: opts.campaignRow ? null : { message: 'not found' },
            }),
          }),
        }),
      }
    }

    builder.insert = (payload: unknown) => {
      calls.push({ table, op: 'insert', payload })
      // action_log insert → select → single (devolve id da linha pending)
      return {
        select: () => ({
          single: async () => ({ data: { id: 'log-1' }, error: null }),
        }),
      }
    }

    builder.update = (payload: unknown) => {
      calls.push({ table, op: 'update', payload })
      return { eq: async () => ({ error: null }) }
    }

    return builder
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    from,
  }

  return { client, calls }
}

function metaCampaignRow(status: string) {
  return {
    id: 'camp-1',
    external_campaign_id: 'ext-123',
    status,
    platform: 'meta',
    daily_budget: 50,
    ad_accounts: {
      id: 'acc-1',
      encrypted_token: encryptToken('meta-tok', VALID_KEY),
      encrypted_refresh_token: null,
      external_account_id: 'act_123',
      workspace_id: 'ws-1',
    },
  }
}

function googleCampaignRow(status: string) {
  return {
    id: 'camp-g1',
    external_campaign_id: 'g-456',
    status,
    platform: 'google',
    daily_budget: 80,
    ad_accounts: {
      id: 'acc-g1',
      encrypted_token: encryptToken('google-tok', VALID_KEY),
      encrypted_refresh_token: encryptToken('google-refresh', VALID_KEY),
      external_account_id: '123-456-7890',
      workspace_id: 'ws-1',
    },
  }
}

describe('pauseCampaign (Story 2.7)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    vi.resetModules()
    vi.doMock('next/navigation', () => ({ redirect: vi.fn() }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('a) sucesso: API ok → action_log success + ad_campaigns.status=paused', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: metaCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { pauseCampaign } = await import('@/app/actions/campaigns')
    const result = await pauseCampaign('camp-1')

    expect(result).toEqual({})
    expect(fetchMock).toHaveBeenCalledOnce()

    // action_log inserido como pending ANTES da API.
    const logInsert = calls.find((c) => c.table === 'action_log' && c.op === 'insert')
    expect(logInsert).toBeTruthy()
    expect((logInsert?.payload as { status: string }).status).toBe('pending')
    expect((logInsert?.payload as { action_type: string }).action_type).toBe('pause')
    expect((logInsert?.payload as { campaign_id: string }).campaign_id).toBe('ext-123')

    // action_log atualizado para success.
    const logSuccess = calls.find(
      (c) =>
        c.table === 'action_log' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'success'
    )
    expect(logSuccess).toBeTruthy()

    // ad_campaigns atualizado para paused (AC 2.7.4).
    const campaignUpdate = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'update'
    )
    expect(campaignUpdate).toBeTruthy()
    expect((campaignUpdate?.payload as { status: string }).status).toBe('paused')
  })

  it('b) falha de API: erro → action_log failed + ad_campaigns INALTERADO', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: metaCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid campaign state' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { pauseCampaign } = await import('@/app/actions/campaigns')
    const result = await pauseCampaign('camp-1')

    expect(result.error).toBe('Invalid campaign state')

    // action_log marcado como failed com api_error.
    const logFailed = calls.find(
      (c) =>
        c.table === 'action_log' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'failed'
    )
    expect(logFailed).toBeTruthy()
    expect((logFailed?.payload as { api_error: string }).api_error).toBe(
      'Invalid campaign state'
    )

    // ad_campaigns NUNCA é atualizado em caso de falha (AC 2.7.3).
    const campaignUpdate = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'update'
    )
    expect(campaignUpdate).toBeUndefined()
  })

  it('c) ownership: campanha de outro workspace → erro, sem action_log e sem API', async () => {
    // campaignRow null simula o .eq(workspace_id) não encontrando a linha.
    const { client, calls } = createSupabaseMock({ campaignRow: null })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { pauseCampaign } = await import('@/app/actions/campaigns')
    const result = await pauseCampaign('camp-outro-ws')

    expect(result.error).toBe('Campanha não encontrada')

    // Nenhum action_log inserido e a API externa NUNCA é chamada (AC 2.7.6).
    expect(calls.find((c) => c.table === 'action_log')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('updateCampaignBudget — validação (Story 2.7 AC 2.7.5)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    vi.resetModules()
    vi.doMock('next/navigation', () => ({ redirect: vi.fn() }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejeita orçamento <= 0 sem chamar a API nem registrar log', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: metaCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { updateCampaignBudget } = await import('@/app/actions/campaigns')
    const result = await updateCampaignBudget('camp-1', -10)

    expect(result.error).toBe('Valor de orçamento inválido')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(calls.find((c) => c.table === 'action_log')).toBeUndefined()
  })
})

describe('updateCampaignBudget Google — CampaignBudget resourceName (Story 2.7)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token'
    vi.resetModules()
    vi.doMock('next/navigation', () => ({ redirect: vi.fn() }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))
    // refreshGoogleToken não deve ser acionado nestes cenários (sem 401).
    vi.doMock('@/lib/oauth/google', () => ({
      refreshGoogleToken: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('a) resourceName não encontrado → erro inline, ad_campaigns inalterado', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: googleCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    // Única chamada fetch esperada: o GAQL search retorna results vazia.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { updateCampaignBudget } = await import('@/app/actions/campaigns')
    const result = await updateCampaignBudget('camp-g1', 120)

    expect(result.error).toBe('CampaignBudget não encontrado para esta campanha')
    // Só o search foi chamado — a mutação NÃO é tentada sem o resourceName.
    expect(fetchMock).toHaveBeenCalledOnce()

    // action_log marcado failed; ad_campaigns NÃO é atualizado (AC 2.7.3).
    const logFailed = calls.find(
      (c) =>
        c.table === 'action_log' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'failed'
    )
    expect(logFailed).toBeTruthy()
    expect(
      calls.find((c) => c.table === 'ad_campaigns' && c.op === 'update')
    ).toBeUndefined()
  })

  it('b) mutation falha após resource encontrado → erro inline, ad_campaigns inalterado', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: googleCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    // 1ª fetch (GAQL search) → resourceName válido; 2ª fetch (campaignBudgets:mutate) → 400.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { campaign: { campaignBudget: 'customers/1234567890/campaignBudgets/999' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Budget too low' } }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { updateCampaignBudget } = await import('@/app/actions/campaigns')
    const result = await updateCampaignBudget('camp-g1', 120)

    expect(result.error).toBe('Budget too low')
    // search + mutate = 2 chamadas.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // A 2ª chamada deve ser ao endpoint campaignBudgets:mutate.
    expect(String(fetchMock.mock.calls[1][0])).toContain('campaignBudgets:mutate')

    const logFailed = calls.find(
      (c) =>
        c.table === 'action_log' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'failed'
    )
    expect(logFailed).toBeTruthy()
    expect(
      calls.find((c) => c.table === 'ad_campaigns' && c.op === 'update')
    ).toBeUndefined()
  })

  it('c) sucesso: resourceName encontrado + mutation ok → success + ad_campaigns.daily_budget', async () => {
    const { client, calls } = createSupabaseMock({
      campaignRow: googleCampaignRow('active'),
    })
    vi.doMock('@advezo/database', () => ({
      createSupabaseServerClient: vi.fn(async () => client),
    }))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { campaign: { campaignBudget: 'customers/1234567890/campaignBudgets/999' } },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { updateCampaignBudget } = await import('@/app/actions/campaigns')
    const result = await updateCampaignBudget('camp-g1', 120)

    expect(result).toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const campaignUpdate = calls.find(
      (c) => c.table === 'ad_campaigns' && c.op === 'update'
    )
    expect(campaignUpdate).toBeTruthy()
    expect((campaignUpdate?.payload as { daily_budget: number }).daily_budget).toBe(120)
  })
})
