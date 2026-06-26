import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PlatformIcon } from '@/components/atoms/PlatformIcon'

describe('PlatformIcon', () => {
  it('renders meta icon with aria-label', () => {
    const { container } = render(<PlatformIcon platform="meta" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('Meta')
  })

  it('renders google icon with aria-label', () => {
    const { container } = render(<PlatformIcon platform="google" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('Google')
  })

  it('renders whatsapp icon with aria-label', () => {
    const { container } = render(<PlatformIcon platform="whatsapp" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('WhatsApp')
  })

  it('applies size sm class', () => {
    const { container } = render(<PlatformIcon platform="meta" size="sm" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('size-4')
  })

  it('applies size lg class', () => {
    const { container } = render(<PlatformIcon platform="meta" size="lg" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('size-6')
  })
})
