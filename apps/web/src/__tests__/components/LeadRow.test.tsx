import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LeadRow } from '@/components/molecules/LeadRow'
import type { LeadDisplay } from '@/types/leads'

vi.mock('@/app/actions/leads', () => ({
  updateLeadStatus: vi.fn(() => Promise.resolve({})),
  bulkUpdateLeadStatus: vi.fn(() => Promise.resolve({ updated: 0, errors: [] })),
}))

afterEach(cleanup)

function makeLead(overrides: Partial<LeadDisplay> = {}): LeadDisplay {
  return {
    id: 'lead-1',
    workspace_id: 'ws-1',
    client_id: 'client-1',
    lead_form_id: null,
    meta_lead_id: null,
    source: 'landing_page',
    status: 'novo',
    name: 'Maria Silva',
    phone_hash: 'hash-abc',
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

const noop = () => {}

describe('LeadRow (AC 8.8.2 / 8.8.4 / 8.8.6)', () => {
  it('exibe nome, telefone mascarado e email vazio (—) sem consentimento', () => {
    render(
      <LeadRow
        lead={makeLead()}
        selected={false}
        onToggleSelect={noop}
        onOpenDetail={noop}
      />
    )
    expect(screen.getByText('Maria Silva')).toBeDefined()
    // Telefone nunca exibe phone_hash; sempre o placeholder mascarado.
    expect(screen.queryByText('hash-abc')).toBeNull()
    expect(screen.getByText('••••')).toBeDefined()
    // Email — exibe em dash quando null (sem consentimento).
    expect(screen.getByText('—')).toBeDefined()
  })

  it('exibe email descriptografado quando presente (com consentimento)', () => {
    render(
      <LeadRow
        lead={makeLead({
          consent_given_at: '2026-06-30T10:00:00.000Z',
          email: 'maria@example.com',
        })}
        selected={false}
        onToggleSelect={noop}
        onOpenDetail={noop}
      />
    )
    expect(screen.getByText('maria@example.com')).toBeDefined()
  })

  it('lead novo expõe ações Qualificar e Descartar', () => {
    render(
      <LeadRow
        lead={makeLead({ status: 'novo' })}
        selected={false}
        onToggleSelect={noop}
        onOpenDetail={noop}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ações do lead' }))
    expect(screen.getByRole('menuitem', { name: 'Qualificar' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Descartar' })).toBeDefined()
  })

  it('lead convertido (terminal) não exibe botão de ações (AC 8.8.6)', () => {
    render(
      <LeadRow
        lead={makeLead({ status: 'convertido' })}
        selected={false}
        onToggleSelect={noop}
        onOpenDetail={noop}
      />
    )
    expect(screen.queryByRole('button', { name: 'Ações do lead' })).toBeNull()
  })

  it('checkbox de seleção dispara onToggleSelect com o id do lead (AC 8.8.7)', () => {
    const onToggle = vi.fn()
    render(
      <LeadRow
        lead={makeLead()}
        selected={false}
        onToggleSelect={onToggle}
        onOpenDetail={noop}
      />
    )
    fireEvent.click(screen.getByLabelText('Selecionar lead Maria Silva'))
    expect(onToggle).toHaveBeenCalledWith('lead-1')
  })
})
