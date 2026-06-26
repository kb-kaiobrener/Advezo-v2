import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Users } from 'lucide-react'
import { MetricCard } from '@/components/molecules/MetricCard'

afterEach(cleanup)

describe('MetricCard', () => {
  it('renderiza title e value', () => {
    const { getByText } = render(
      <MetricCard title="Total de Clientes Ativos" value={12} icon={Users} />
    )
    expect(getByText('Total de Clientes Ativos')).toBeTruthy()
    expect(getByText('12')).toBeTruthy()
  })

  it('renderiza description quando fornecida', () => {
    const { getByText } = render(
      <MetricCard
        title="Saudáveis"
        value={5}
        icon={Users}
        description="score >= 70"
      />
    )
    expect(getByText('score >= 70')).toBeTruthy()
  })
})
