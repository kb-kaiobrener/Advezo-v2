import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  ClientHealthCard,
  type ClientHealthData,
} from '@/components/molecules/ClientHealthCard'

afterEach(cleanup)

function makeData(overrides: Partial<ClientHealthData> = {}): ClientHealthData {
  return {
    clientId: 'c1',
    clientName: 'Acme Marketing',
    healthScore: 0,
    roas: 0,
    spend: 0,
    budget: 0,
    ...overrides,
  }
}

describe('ClientHealthCard', () => {
  it('renderiza o nome do cliente', () => {
    const { getByText } = render(<ClientHealthCard data={makeData()} />)
    expect(getByText('Acme Marketing')).toBeTruthy()
  })

  it('score 75 → StatusBadge "good" (Saudável)', () => {
    const { getByText } = render(
      <ClientHealthCard data={makeData({ healthScore: 75 })} />
    )
    expect(getByText('Saudável')).toBeTruthy()
  })

  it('score 50 → StatusBadge "warning" (Atenção)', () => {
    const { getByText } = render(
      <ClientHealthCard data={makeData({ healthScore: 50 })} />
    )
    expect(getByText('Atenção')).toBeTruthy()
  })

  it('score 30 → StatusBadge "critical" (Crítico)', () => {
    const { getByText } = render(
      <ClientHealthCard data={makeData({ healthScore: 30 })} />
    )
    expect(getByText('Crítico')).toBeTruthy()
  })

  it('score 0 (stub Epic 1) → StatusBadge "critical" (Crítico)', () => {
    const { getByText } = render(
      <ClientHealthCard data={makeData({ healthScore: 0 })} />
    )
    expect(getByText('Crítico')).toBeTruthy()
  })

  it('formata ROAS e gasto/budget', () => {
    const { getByText } = render(
      <ClientHealthCard
        data={makeData({ roas: 3.2, spend: 1000, budget: 2000 })}
      />
    )
    expect(getByText('3.2x')).toBeTruthy()
    expect(getByText('R$ 1000.00 / R$ 2000.00')).toBeTruthy()
  })
})
