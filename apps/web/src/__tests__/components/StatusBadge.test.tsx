import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBadge } from '@/components/atoms/StatusBadge'

describe('StatusBadge', () => {
  it('renders Saudável for good status', () => {
    const { getByText } = render(<StatusBadge status="good" />)
    expect(getByText('Saudável')).toBeTruthy()
  })

  it('renders Atenção for warning status', () => {
    const { getByText } = render(<StatusBadge status="warning" />)
    expect(getByText('Atenção')).toBeTruthy()
  })

  it('renders Crítico for critical status', () => {
    const { getByText } = render(<StatusBadge status="critical" />)
    expect(getByText('Crítico')).toBeTruthy()
  })

  it('applies bg-health-good-bg class for good status', () => {
    const { container } = render(<StatusBadge status="good" />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('bg-health-good-bg')
    expect(span?.className).toContain('text-health-good-text')
  })

  it('applies bg-health-warning-bg class for warning status', () => {
    const { container } = render(<StatusBadge status="warning" />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('bg-health-warning-bg')
    expect(span?.className).toContain('text-health-warning-text')
  })

  it('applies bg-health-critical-bg class for critical status', () => {
    const { container } = render(<StatusBadge status="critical" />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('bg-health-critical-bg')
    expect(span?.className).toContain('text-health-critical-text')
  })
})
