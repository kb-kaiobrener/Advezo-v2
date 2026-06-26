import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HealthBar } from '@/components/atoms/HealthBar'

describe('HealthBar', () => {
  it('renders a progressbar', () => {
    const { container } = render(<HealthBar value={75} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).toBeTruthy()
  })

  it('applies bg-health-good for value >= 70', () => {
    const { container } = render(<HealthBar value={70} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.className).toContain('bg-health-good')
  })

  it('applies bg-health-warning for value 40-69', () => {
    const { container } = render(<HealthBar value={55} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.className).toContain('bg-health-warning')
  })

  it('applies bg-health-critical for value < 40', () => {
    const { container } = render(<HealthBar value={30} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.className).toContain('bg-health-critical')
  })

  it('clamps value at 100', () => {
    const { container } = render(<HealthBar value={150} showLabel />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('100')
  })

  it('clamps value at 0', () => {
    const { container } = render(<HealthBar value={-10} showLabel />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('shows label when showLabel is true', () => {
    const { getByText } = render(<HealthBar value={85} showLabel />)
    expect(getByText('85%')).toBeTruthy()
  })
})
