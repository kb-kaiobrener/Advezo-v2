import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LeadStatusBadge } from '@/components/molecules/LeadStatusBadge'
import { LeadSourceBadge } from '@/components/molecules/LeadSourceBadge'

afterEach(cleanup)

describe('LeadStatusBadge', () => {
  it('mapeia cada status para o label PT-BR e a cor correta (AC 8.8.2)', () => {
    const { rerender } = render(<LeadStatusBadge status="novo" />)
    expect(screen.getByText('Novo').className).toContain('bg-gray-100')

    rerender(<LeadStatusBadge status="qualificado" />)
    expect(screen.getByText('Qualificado').className).toContain('health-good')

    rerender(<LeadStatusBadge status="desqualificado" />)
    expect(screen.getByText('Desqualificado').className).toContain('health-critical')

    rerender(<LeadStatusBadge status="convertido" />)
    expect(screen.getByText('Convertido').className).toContain('bg-blue-100')
  })
})

describe('LeadSourceBadge', () => {
  it('exibe LP para landing_page e Lead Ads para lead_ads (AC 8.8.2)', () => {
    const { rerender } = render(<LeadSourceBadge source="landing_page" />)
    expect(screen.getByText('LP')).toBeDefined()

    rerender(<LeadSourceBadge source="lead_ads" />)
    expect(screen.getByText('Lead Ads')).toBeDefined()
  })
})
