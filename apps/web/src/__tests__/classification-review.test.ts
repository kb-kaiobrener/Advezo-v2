import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@advezo/database', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { reviewClassification, type FunnelStage } from '@/app/actions/classification-review'

const mockServer = vi.mocked(createSupabaseServerClient)
const mockService = vi.mocked(createSupabaseServiceClient)

beforeEach(() => vi.clearAllMocks())

describe('reviewClassification — MAINT-01 AC 5 (validação pré-membership)', () => {
  it('ação inválida → erro SEM nenhuma chamada a auth/banco', async () => {
    const r = await reviewClassification('c1', { action: 'x' } as never)
    expect(r).toEqual({ error: 'Ação inválida' })
    expect(mockServer).not.toHaveBeenCalled()
    expect(mockService).not.toHaveBeenCalled()
  })

  it('stage inválido → erro sem banco', async () => {
    const r = await reviewClassification('c1', { action: 'correct', funnel_stage: 'zzz' as FunnelStage, is_sale: true, sale_value_estimate: null })
    expect(r).toEqual({ error: 'Etapa de funil inválida' })
    expect(mockService).not.toHaveBeenCalled()
  })

  it('sale_value negativo/NaN → erro sem banco', async () => {
    const r = await reviewClassification('c1', { action: 'correct', funnel_stage: 'sale', is_sale: true, sale_value_estimate: -5 })
    expect(r).toEqual({ error: 'Valor de venda inválido' })
    expect(mockService).not.toHaveBeenCalled()
  })

  it('correção válida → UPDATE com filtros id + workspace (IDOR)', async () => {
    mockServer.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    } as never)
    const filters: unknown[] = []
    let payload: unknown
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain); chain.limit = vi.fn(() => chain)
    chain.eq = vi.fn((...a: unknown[]) => { filters.push(a); return chain })
    chain.single = vi.fn().mockResolvedValue({ data: { workspace_id: 'ws1' }, error: null })
    chain.update = vi.fn((p: unknown) => { payload = p; return chain })
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r)
    mockService.mockReturnValue({ from: vi.fn(() => chain) } as never)

    const r = await reviewClassification('c1', { action: 'correct', funnel_stage: 'intent', is_sale: false, sale_value_estimate: null })
    expect(r).toEqual({ success: true })
    expect(payload).toMatchObject({ funnel_stage: 'intent', is_sale: false, reviewed_by: 'u1' })
    expect(filters).toContainEqual(['id', 'c1'])
    expect(filters).toContainEqual(['workspace_id', 'ws1'])
  })
})
