import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@advezo/database', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@advezo/database'
import {
  classifyObjectives,
  aggregateMetrics,
  buildReport,
  formatBRL,
  formatNumber,
  formatPercent,
  formatMultiplier,
  buildEmptyReport,
  generateReport,
  type Period,
} from '@/lib/whatsapp/report-generator'

const mockCreateServiceClient = vi.mocked(createSupabaseServiceClient)

const WS = 'ws-1'
const CLIENT = 'client-1'
const PERIOD: Period = { from: new Date('2026-06-23'), to: new Date('2026-06-30') }

function makeDbMock(
  accounts: unknown[],
  campaigns: unknown[],
  metrics: unknown[]
) {
  const sequences = [accounts, campaigns, metrics]
  let callCount = 0

  return {
    from: vi.fn().mockImplementation(() => {
      const resolved = { data: sequences[callCount] ?? [], error: null }
      callCount++

      // Chain é thenable: qualquer ponto do builder pode ser awaited
      const chain: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown) => Promise.resolve(resolved).then(res),
        catch: (rej: (e: unknown) => unknown) => Promise.resolve(resolved).catch(rej),
      }
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'limit', 'single']) {
        chain[m] = vi.fn().mockReturnValue(chain)
      }
      return chain
    }),
  }
}

beforeEach(() => vi.clearAllMocks())

// ── Funções puras ─────────────────────────────────────────────────────────────

describe('classifyObjectives', () => {
  it('retorna vendas para OUTCOME_SALES', () => {
    expect(classifyObjectives(['OUTCOME_SALES'])).toBe('vendas')
  })
  it('retorna vendas para CONVERSIONS', () => {
    expect(classifyObjectives(['CONVERSIONS'])).toBe('vendas')
  })
  it('retorna leads para OUTCOME_LEADS', () => {
    expect(classifyObjectives(['OUTCOME_LEADS'])).toBe('leads')
  })
  it('retorna mensagens para MESSAGES', () => {
    expect(classifyObjectives(['MESSAGES'])).toBe('mensagens')
  })
  it('retorna default quando objective é vazio', () => {
    expect(classifyObjectives([''])).toBe('default')
  })
  it('retorna default quando lista é vazia', () => {
    expect(classifyObjectives([])).toBe('default')
  })
})

describe('aggregateMetrics', () => {
  it('soma todas as colunas corretamente', () => {
    const result = aggregateMetrics([
      { spend: 100, impressions: 1000, clicks: 50, conversions: 5, revenue: 500 },
      { spend: 200, impressions: 2000, clicks: 100, conversions: 10, revenue: 1000 },
    ])
    expect(result).toEqual({
      spend: 300,
      impressions: 3000,
      clicks: 150,
      conversions: 15,
      revenue: 1500,
    })
  })
  it('retorna zeros para lista vazia', () => {
    expect(aggregateMetrics([])).toEqual({
      spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
    })
  })
})

describe('formatadores PT-BR', () => {
  it('formatBRL formata valor monetário', () => {
    expect(formatBRL(1234.56)).toMatch(/1\.234,56/)
  })
  it('formatNumber formata número inteiro', () => {
    expect(formatNumber(45678)).toMatch(/45\.678/)
  })
  it('formatPercent formata proporção como %', () => {
    expect(formatPercent(0.027)).toMatch(/2,7/)
  })
  it('formatMultiplier formata multiplicador', () => {
    expect(formatMultiplier(4.6)).toBe('4,6x')
  })
})

// ── 3 cenários obrigatórios AC 3.4.5 ─────────────────────────────────────────

describe('generateReport — cenário 1: Vendas (AC 3.4.5)', () => {
  it('retorna texto com ROAS e conversões para OUTCOME_SALES', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock(
      [{ id: 'acc-1' }],
      [{ id: 'camp-1', objective: 'OUTCOME_SALES' }],
      [{ campaign_id: 'camp-1', spend: 1000, revenue: 4600, conversions: 23, impressions: 50000, clicks: 1500 }]
    ) as never)

    const text = await generateReport(WS, CLIENT, PERIOD)

    expect(text).toContain('Relatório de Vendas')
    expect(text).toContain('ROAS')
    expect(text).toContain('4,6x')
    expect(text).toContain('Conversões')
    expect(text).not.toContain('CPL')
    expect(text).not.toContain('CPM')
  })
})

describe('generateReport — cenário 2: Leads (AC 3.4.5)', () => {
  it('retorna texto com CPL e volume de leads para OUTCOME_LEADS', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock(
      [{ id: 'acc-1' }],
      [{ id: 'camp-1', objective: 'OUTCOME_LEADS' }],
      [{ campaign_id: 'camp-1', spend: 500, revenue: 0, conversions: 10, impressions: 20000, clicks: 400 }]
    ) as never)

    const text = await generateReport(WS, CLIENT, PERIOD)

    expect(text).toContain('Relatório de Leads')
    expect(text).toContain('Leads gerados')
    expect(text).toContain('CPL')
    // CPL = 500/10 = R$ 50,00
    expect(text).toMatch(/50,00/)
    expect(text).not.toContain('ROAS')
    expect(text).not.toContain('CPM')
  })
})

describe('generateReport — cenário 3: Default / sem objetivo (AC 3.4.5)', () => {
  it('retorna relatório genérico com spend e impressões quando objective é null', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock(
      [{ id: 'acc-1' }],
      [{ id: 'camp-1', objective: null }],
      [{ campaign_id: 'camp-1', spend: 300, revenue: 0, conversions: 0, impressions: 10000, clicks: 200 }]
    ) as never)

    const text = await generateReport(WS, CLIENT, PERIOD)

    expect(text).toContain('Relatório de Campanhas')
    expect(text).toContain('Investimento')
    expect(text).toContain('Impressões')
    expect(text).not.toContain('ROAS')
    expect(text).not.toContain('CPL')
    expect(text).not.toContain('Leads gerados')
  })
})

describe('generateReport — edge cases', () => {
  it('retorna mensagem de relatório vazio quando não há ad_accounts', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock([], [], []) as never)
    const text = await generateReport(WS, CLIENT, PERIOD)
    expect(text).toContain('Nenhuma campanha ou métrica encontrada')
  })

  it('retorna mensagem de relatório vazio quando não há campanhas', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock([{ id: 'acc-1' }], [], []) as never)
    const text = await generateReport(WS, CLIENT, PERIOD)
    expect(text).toContain('Nenhuma campanha ou métrica encontrada')
  })

  it('retorna mensagem de relatório vazio quando não há métricas no período', async () => {
    mockCreateServiceClient.mockReturnValue(makeDbMock(
      [{ id: 'acc-1' }],
      [{ id: 'camp-1', objective: 'OUTCOME_SALES' }],
      []
    ) as never)
    const text = await generateReport(WS, CLIENT, PERIOD)
    expect(text).toContain('Nenhuma campanha ou métrica encontrada')
  })

  it('buildEmptyReport contém período e mensagem padrão', () => {
    const text = buildEmptyReport(PERIOD)
    expect(text).toContain('Nenhuma campanha ou métrica encontrada')
    expect(text).toContain('23/06')
    expect(text).toContain('30/06')
  })
})
