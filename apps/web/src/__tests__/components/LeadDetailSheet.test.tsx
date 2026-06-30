import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LeadDetailSheet } from '@/components/molecules/LeadDetailSheet'
import type { LeadDisplay } from '@/types/leads'

afterEach(cleanup)

function makeLead(overrides: Partial<LeadDisplay> = {}): LeadDisplay {
  return {
    id: 'lead-1',
    workspace_id: 'ws-1',
    client_id: 'client-1',
    lead_form_id: null,
    meta_lead_id: null,
    source: 'landing_page',
    status: 'qualificado',
    name: 'Joana Souza',
    phone_hash: 'hash',
    consent_given_at: '2026-06-30T10:00:00.000Z',
    field_data: { empresa: 'Acme', cargo: 'CTO' },
    qualified_at: '2026-06-30T11:00:00.000Z',
    converted_at: null,
    created_at: '2026-06-30T10:00:00.000Z',
    updated_at: '2026-06-30T10:00:00.000Z',
    email: 'joana@example.com',
    capiSent: true,
    ...overrides,
  }
}

describe('LeadDetailSheet (AC 8.8.8)', () => {
  it('não renderiza quando lead é null', () => {
    const { container } = render(<LeadDetailSheet lead={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('exibe nome, email, field_data e badge de CAPI "Enviado"', () => {
    render(<LeadDetailSheet lead={makeLead()} onClose={() => {}} />)
    expect(screen.getByText('Joana Souza')).toBeDefined()
    expect(screen.getByText('joana@example.com')).toBeDefined()
    // field_data renderizado como pares chave/valor.
    expect(screen.getByText('empresa')).toBeDefined()
    expect(screen.getByText('Acme')).toBeDefined()
    expect(screen.getByText('cargo')).toBeDefined()
    expect(screen.getByText('CTO')).toBeDefined()
    // Badge CAPI: capiSent true → "Enviado".
    expect(screen.getByText('Enviado')).toBeDefined()
  })

  it('badge de CAPI exibe "—" quando capiSent é null (fonte indisponível)', () => {
    render(<LeadDetailSheet lead={makeLead({ capiSent: null })} onClose={() => {}} />)
    expect(screen.queryByText('Enviado')).toBeNull()
    expect(screen.queryByText('Não enviado')).toBeNull()
  })

  it('não exibe email quando ausente (sem consentimento)', () => {
    render(
      <LeadDetailSheet
        lead={makeLead({ email: null, consent_given_at: null })}
        onClose={() => {}}
      />
    )
    expect(screen.queryByText('joana@example.com')).toBeNull()
  })
})
