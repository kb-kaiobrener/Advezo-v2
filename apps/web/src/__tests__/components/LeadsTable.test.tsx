import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LeadsTable } from '@/components/molecules/LeadsTable'
import { bulkUpdateLeadStatus } from '@/app/actions/leads'
import type { LeadDisplay } from '@/types/leads'

vi.mock('@/app/actions/leads', () => ({
  updateLeadStatus: vi.fn(() => Promise.resolve({})),
  bulkUpdateLeadStatus: vi.fn(),
}))

const mockBulk = vi.mocked(bulkUpdateLeadStatus)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeLead(id: string, overrides: Partial<LeadDisplay> = {}): LeadDisplay {
  return {
    id,
    workspace_id: 'ws-1',
    client_id: 'client-1',
    lead_form_id: null,
    meta_lead_id: null,
    source: 'landing_page',
    status: 'novo',
    name: `Lead ${id}`,
    phone_hash: 'hash',
    consent_given_at: null,
    field_data: {},
    qualified_at: null,
    converted_at: null,
    created_at: '2026-06-30T10:00:00.000Z',
    updated_at: '2026-06-30T10:00:00.000Z',
    email: null,
    capiSent: null,
    ...overrides,
  }
}

describe('LeadsTable bulk actions (AC 8.8.7)', () => {
  it('seleciona todos e qualifica em lote, exibindo toast com o resultado', async () => {
    mockBulk.mockResolvedValueOnce({ updated: 3, errors: ['lead-x: erro'] })
    render(<LeadsTable leads={[makeLead('a'), makeLead('b'), makeLead('c')]} />)

    fireEvent.click(screen.getByLabelText('Selecionar todos os leads'))
    fireEvent.click(
      screen.getByRole('button', { name: /Qualificar selecionados/ })
    )

    await waitFor(() => {
      expect(mockBulk).toHaveBeenCalledWith(['a', 'b', 'c'], 'qualificado')
    })
    // Toast: "3 leads qualificados, 1 erro" (AC 8.8.7).
    const toast = await screen.findByRole('status')
    expect(toast.textContent).toBe('3 leads qualificados, 1 erro')
  })

  it('barra de bulk só aparece com pelo menos um lead selecionado', () => {
    render(<LeadsTable leads={[makeLead('a')]} />)
    expect(
      screen.queryByRole('button', { name: /Qualificar selecionados/ })
    ).toBeNull()
  })
})
