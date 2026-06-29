import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptToken } from '@advezo/utils'
import type { AlertAccount } from '@/lib/alerts/detect'

/**
 * Testes unitários — detecção de saldo por conta (Story 2.9 — AC 2.9.1-2.9.3 / 2.9.6
 * + requisitos EXPLÍCITOS do QA Gate).
 *
 * Cenários:
 *  1. Detecção: projeção < 7 dias → INSERT em alerts (action 'created').
 *  2. Sem detecção: projeção >= 7 dias e sem alerta ativo → nenhum INSERT ('none').
 *  3. DEDUPLICAÇÃO via constraint (CP4 — requisito QA #1): o INSERT em alerts retorna
 *     erro de unique_violation (code 23505) simulando o índice parcial do banco. O
 *     código DEVE capturar o erro, NÃO propagar exceção e NÃO registrar como falha —
 *     trata como "já existe". Demonstra que a dedup é garantida pelo DB, não só por
 *     query prévia.
 *  4. RESILIÊNCIA da chamada de saldo (requisito QA #2): fetch lança exceção de rede
 *     ao buscar o saldo. detectAccountBalance registra sync_errors com
 *     error_type='alert_detection_failed' e RETORNA ok:false — nunca propaga exceção.
 *  5. Loop do cron com 3 contas onde a do MEIO falha: a 3ª conta É processada.
 *  6. Resolução automática (AC 2.9.6a): alerta ativo + projeção >= 14 → UPDATE
 *     resolved_at (action 'resolved').
 *
 * Não mockamos encryptToken/decryptToken — token real criptografado/descriptografado.
 */

const VALID_KEY = 'a'.repeat(64) // 64 hex chars = 32 bytes

interface MockCall {
  table: string
  op: 'select' | 'insert' | 'update'
  payload?: unknown
}

interface MockConfig {
  /** spend rows devolvidos por campaign_metrics (uma linha por dia). */
  metricsSpends?: number[]
  /** alerta ativo existente (id) ou null. */
  activeAlert?: { id: string } | null
  /** erro a retornar no INSERT em alerts (ex: { code: '23505' }). */
  alertInsertError?: { code?: string; message?: string } | null
  /** se true, fetch global lança exceção de rede (simula API de saldo indisponível). */
  balanceFetchThrows?: boolean
  /** saldo (BRL) devolvido pela API de saldo quando não lança. */
  balance?: number
}

function createSupabaseMock(config: MockConfig) {
  const calls: MockCall[] = []

  function from(table: string) {
    const builder: Record<string, unknown> = {}

    builder.select = () => {
      calls.push({ table, op: 'select' })

      if (table === 'campaign_metrics') {
        // select → eq → gte → (await) resolve com as linhas de spend.
        const rows = (config.metricsSpends ?? []).map((spend) => ({ spend }))
        return {
          eq: () => ({
            gte: async () => ({ data: rows, error: null }),
          }),
        }
      }

      if (table === 'alerts') {
        // select → eq → eq → is → maybeSingle → alerta ativo (ou null).
        return {
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: config.activeAlert ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      return { eq: () => ({ gte: async () => ({ data: [], error: null }) }) }
    }

    builder.insert = (payload: unknown) => {
      calls.push({ table, op: 'insert', payload })
      if (table === 'alerts') {
        return Promise.resolve({ error: config.alertInsertError ?? null })
      }
      // sync_errors insert.
      return Promise.resolve({ error: null })
    }

    builder.update = (payload: unknown) => {
      calls.push({ table, op: 'update', payload })
      return { eq: async () => ({ error: null }) }
    }

    return builder
  }

  return { client: { from }, calls }
}

function metaAccount(id: string): AlertAccount {
  return {
    id,
    workspace_id: 'ws-1',
    platform: 'meta',
    external_account_id: 'act_123',
    encrypted_token: encryptToken('meta-tok', VALID_KEY),
  }
}

/** fetch que devolve um saldo Meta (centavos) ou lança erro de rede. */
function stubBalanceFetch(config: MockConfig) {
  if (config.balanceFetchThrows) {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const cents = Math.round((config.balance ?? 0) * 100)
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ balance: String(cents) }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('detectAccountBalance (Story 2.9)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('1. detecção: projeção < 7 dias → INSERT em alerts (created)', async () => {
    // saldo 30, gasto 70/7=10/dia → 3 dias < 7 → alerta.
    const config: MockConfig = {
      balance: 30,
      metricsSpends: [10, 10, 10, 10, 10, 10, 10],
      activeAlert: null,
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')
    const result = await detectAccountBalance(metaAccount('acc-1'), client as never)

    expect(result.ok).toBe(true)
    expect(result.action).toBe('created')
    expect(result.projectedDays).toBe(3)

    const alertInsert = calls.find((c) => c.table === 'alerts' && c.op === 'insert')
    expect(alertInsert).toBeTruthy()
    expect((alertInsert?.payload as { alert_type: string }).alert_type).toBe('low_balance')
    expect((alertInsert?.payload as { threshold_days: number }).threshold_days).toBe(7)
    expect((alertInsert?.payload as { ad_account_id: string }).ad_account_id).toBe('acc-1')
    // Nenhuma falha registrada.
    expect(calls.find((c) => c.table === 'sync_errors')).toBeUndefined()
  })

  it('2. sem detecção: projeção >= 7 dias e sem alerta ativo → nenhum INSERT (none)', async () => {
    // saldo 1000, gasto 10/dia → 100 dias >= 7 → não alerta.
    const config: MockConfig = {
      balance: 1000,
      metricsSpends: [10, 10, 10, 10, 10, 10, 10],
      activeAlert: null,
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')
    const result = await detectAccountBalance(metaAccount('acc-2'), client as never)

    expect(result.ok).toBe(true)
    expect(result.action).toBe('none')
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'insert')).toBeUndefined()
  })

  it('3. DEDUP via constraint (CP4): INSERT retorna 23505 → captura sem propagar nem duplicar', async () => {
    // Cenário de corrida: a query prévia não viu alerta ativo (activeAlert null), mas
    // o índice único parcial do banco rejeita o INSERT com unique_violation (23505).
    // O código deve tratar como "já existe" — ok:true, action 'none', SEM sync_errors.
    const config: MockConfig = {
      balance: 30,
      metricsSpends: [10, 10, 10, 10, 10, 10, 10], // projeção 3 dias → tentaria inserir
      activeAlert: null,
      alertInsertError: { code: '23505', message: 'duplicate key value violates unique constraint "alerts_active_unique"' },
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')

    // NÃO deve lançar exceção.
    const result = await detectAccountBalance(metaAccount('acc-3'), client as never)

    expect(result.ok).toBe(true)
    expect(result.action).toBe('none') // dedup: tratado como já existente
    // O INSERT FOI tentado (a dedup é do banco, não de uma checagem que pula o insert).
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'insert')).toBeTruthy()
    // 23505 NÃO é falha de detecção — nada em sync_errors.
    expect(calls.find((c) => c.table === 'sync_errors')).toBeUndefined()
  })

  it('4. RESILIÊNCIA: fetch de saldo lança → sync_errors alert_detection_failed, sem propagar', async () => {
    const config: MockConfig = {
      balanceFetchThrows: true,
      metricsSpends: [10, 10, 10],
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')

    // NÃO propaga exceção — devolve ok:false.
    const result = await detectAccountBalance(metaAccount('acc-4'), client as never)

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()

    const syncError = calls.find((c) => c.table === 'sync_errors' && c.op === 'insert')
    expect(syncError).toBeTruthy()
    expect((syncError?.payload as { error_type: string }).error_type).toBe(
      'alert_detection_failed'
    )
    // Nenhum alerta criado quando a detecção falha.
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'insert')).toBeUndefined()
  })

  it('6. resolução automática: alerta ativo + projeção >= 14 → UPDATE resolved_at (resolved)', async () => {
    // saldo 1000, gasto 10/dia → 100 dias >= 14 → resolve o alerta ativo.
    const config: MockConfig = {
      balance: 1000,
      metricsSpends: [10, 10, 10, 10, 10, 10, 10],
      activeAlert: { id: 'alert-1' },
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')
    const result = await detectAccountBalance(metaAccount('acc-6'), client as never)

    expect(result.ok).toBe(true)
    expect(result.action).toBe('resolved')

    const alertUpdate = calls.find((c) => c.table === 'alerts' && c.op === 'update')
    expect(alertUpdate).toBeTruthy()
    expect((alertUpdate?.payload as { resolved_at: string }).resolved_at).toBeTruthy()
    // Não cria novo alerta quando está resolvendo.
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'insert')).toBeUndefined()
  })

  it('mantém alerta ativo quando projeção segue abaixo de 14 (sem resolver, sem duplicar)', async () => {
    // saldo 100, gasto 10/dia → 10 dias: < 14 (não resolve) e já existe alerta ativo
    // (não cria) → action 'none', sem insert e sem update.
    const config: MockConfig = {
      balance: 100,
      metricsSpends: [10, 10, 10, 10, 10, 10, 10],
      activeAlert: { id: 'alert-1' },
    }
    const { client, calls } = createSupabaseMock(config)
    stubBalanceFetch(config)

    const { detectAccountBalance } = await import('@/lib/alerts/detect')
    const result = await detectAccountBalance(metaAccount('acc-7'), client as never)

    expect(result.action).toBe('none')
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'insert')).toBeUndefined()
    expect(calls.find((c) => c.table === 'alerts' && c.op === 'update')).toBeUndefined()
  })
})

/**
 * 5. Loop de resiliência no nível do cron route: 3 contas, a do MEIO falha na chamada
 * de saldo. A primeira e a TERCEIRA devem ser processadas (loop não para), e a do meio
 * registra alert_detection_failed. Requisito QA #2 (parte b/c).
 */
describe('POST /api/alerts/detect — loop não para na conta que falha (QA #2)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
    process.env.CRON_SECRET = 'super-secret-cron-value-min-32-chars-xx'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('401 quando o header x-cron-secret está ausente', async () => {
    vi.doMock('@advezo/database', () => ({
      createSupabaseServiceClient: vi.fn(),
    }))
    const { POST } = await import('@/app/api/alerts/detect/route')
    const res = await POST(
      new Request('http://localhost:3000/api/alerts/detect', { method: 'POST' })
    )
    expect(res.status).toBe(401)
  })

  it('3 contas, a do meio falha o fetch de saldo → 1ª e 3ª processadas, 2ª em sync_errors', async () => {
    const accounts: AlertAccount[] = [
      {
        id: 'acc-A',
        workspace_id: 'ws-1',
        platform: 'meta',
        external_account_id: 'act_A',
        encrypted_token: encryptToken('tokA', VALID_KEY),
      },
      {
        id: 'acc-B',
        workspace_id: 'ws-1',
        platform: 'meta',
        external_account_id: 'act_B',
        encrypted_token: encryptToken('tokB', VALID_KEY),
      },
      {
        id: 'acc-C',
        workspace_id: 'ws-1',
        platform: 'meta',
        external_account_id: 'act_C',
        encrypted_token: encryptToken('tokC', VALID_KEY),
      },
    ]

    const calls: MockCall[] = []
    const insertedAlertAccounts: string[] = []
    const syncErrorAccounts: string[] = []

    // Client de service-role: lista as 3 contas e provê os builders por conta. Como o
    // mesmo client é injetado em detectAccountBalance, ele precisa responder a todas as
    // tabelas. Aqui o spend é fixo (10/dia) e não há alerta ativo, então cada conta que
    // NÃO falha tenta criar alerta (saldo baixo abaixo).
    function from(table: string) {
      const builder: Record<string, unknown> = {}

      builder.select = (cols?: string) => {
        // Listagem inicial das contas no route.
        if (table === 'ad_accounts') {
          return { eq: async () => ({ data: accounts, error: null }) }
        }
        if (table === 'campaign_metrics') {
          return {
            eq: () => ({
              gte: async () => ({
                data: [10, 10, 10, 10, 10, 10, 10].map((spend) => ({ spend })),
                error: null,
              }),
            }),
          }
        }
        if (table === 'alerts') {
          return {
            eq: () => ({
              eq: () => ({
                is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }
        }
        void cols
        return { eq: async () => ({ data: [], error: null }) }
      }

      builder.insert = (payload: unknown) => {
        calls.push({ table, op: 'insert', payload })
        if (table === 'alerts') {
          insertedAlertAccounts.push((payload as { ad_account_id: string }).ad_account_id)
        }
        if (table === 'sync_errors') {
          syncErrorAccounts.push((payload as { ad_account_id: string }).ad_account_id)
        }
        return Promise.resolve({ error: null })
      }

      builder.update = (payload: unknown) => {
        calls.push({ table, op: 'update', payload })
        return { eq: async () => ({ error: null }) }
      }

      return builder
    }

    vi.doMock('@advezo/database', () => ({
      createSupabaseServiceClient: vi.fn(() => ({ from })),
    }))

    // fetch de saldo: contas A e C devolvem saldo baixo (30 → 3 dias); a B lança rede.
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('act_B')) {
        throw new Error('network down on B')
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ balance: '3000' }), // 3000 centavos = R$30 → 3 dias
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await import('@/app/api/alerts/detect/route')
    const res = await POST(
      new Request('http://localhost:3000/api/alerts/detect', {
        method: 'POST',
        headers: { 'x-cron-secret': 'super-secret-cron-value-min-32-chars-xx' },
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()

    // 1 falha (B) e 2 alertas criados (A e C) — a 3ª conta FOI processada apesar da 2ª falhar.
    expect(body.errors).toBe(1)
    expect(body.created).toBe(2)

    // A e C tiveram alerta criado; B não.
    expect(insertedAlertAccounts).toContain('acc-A')
    expect(insertedAlertAccounts).toContain('acc-C')
    expect(insertedAlertAccounts).not.toContain('acc-B')

    // B registrou alert_detection_failed.
    expect(syncErrorAccounts).toEqual(['acc-B'])

    // Resultado por conta confirma que as 3 foram visitadas.
    expect(body.accounts).toHaveLength(3)
    const cResult = body.accounts.find((a: { id: string }) => a.id === 'acc-C')
    expect(cResult.ok).toBe(true)
    expect(cResult.action).toBe('created')
  })
})
