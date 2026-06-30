import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConsentBadge } from '@/components/molecules/ConsentBadge'

afterEach(cleanup)

describe('ConsentBadge (AC 8.8.5)', () => {
  it('mostra escudo de consentimento + tooltip com data quando consent_given_at presente', () => {
    render(
      <ConsentBadge consentGivenAt="2026-06-30T12:00:00.000Z" source="landing_page" />
    )
    // Tooltip com data formatada PT-BR (30/06/2026).
    expect(screen.getByRole('tooltip').textContent).toContain('30/06/2026')
    expect(
      screen.getByLabelText(/Consentimento explícito registrado em 30\/06\/2026/)
    ).toBeDefined()
  })

  it('mostra badge "Meta Terms" para lead_ads sem consentimento', () => {
    render(<ConsentBadge consentGivenAt={null} source="lead_ads" />)
    expect(screen.getByText('Meta Terms')).toBeDefined()
  })

  it('não renderiza badge para landing_page sem consentimento', () => {
    const { container } = render(
      <ConsentBadge consentGivenAt={null} source="landing_page" />
    )
    expect(container.firstChild).toBeNull()
  })
})
