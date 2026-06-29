import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CampaignRow } from '@/components/molecules/CampaignRow'

// apps/web vitest has no global RTL auto-cleanup — clear the DOM between renders
// so duplicate text (e.g. account name) does not leak across test cases.
afterEach(cleanup)

describe('CampaignRow', () => {
  it('renders a Meta active campaign with name, status, platform and spend', () => {
    const { container } = render(
      <CampaignRow
        campaignId="camp-1"
        platform="meta"
        name="Campanha Black Friday"
        status="active"
        budget={50}
        dailyBudget={50}
        spend7d={1234.5}
        accountName="Conta Meta Principal"
      />
    )

    expect(screen.getByText('Campanha Black Friday')).toBeDefined()
    expect(screen.getByText('Ativa')).toBeDefined()
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Meta')
    expect(screen.getByText(/1\.234,50/)).toBeDefined()
    // AC 2.7.1: campanha ativa mostra "Pausar" (não "Ativar").
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull()
  })

  it('renders a Google paused campaign with the Google platform icon', () => {
    const { container } = render(
      <CampaignRow
        campaignId="camp-2"
        platform="google"
        name="Search - Marca"
        status="paused"
        budget={100}
        dailyBudget={100}
        spend7d={42}
        accountName="Conta Google Ads"
      />
    )

    expect(screen.getByText('Search - Marca')).toBeDefined()
    expect(screen.getByText('Pausada')).toBeDefined()
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Google')
    // AC 2.7.1: campanha pausada mostra "Ativar" (não "Pausar").
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
  })

  it('renders zero spend as a formatted currency value', () => {
    render(
      <CampaignRow
        campaignId="camp-3"
        platform="meta"
        name="Campanha Inativa"
        status="archived"
        budget={null}
        dailyBudget={null}
        spend7d={0}
        accountName="Conta Sem Gasto"
      />
    )

    // Budget null renders as em dash; zero spend renders as R$ 0,00.
    expect(screen.getByText(/0,00/)).toBeDefined()
    expect(screen.getByText('Arquivada')).toBeDefined()
    // AC 2.7.1: campanha archived não mostra ações inline (CampaignActions = null).
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull()
  })
})
