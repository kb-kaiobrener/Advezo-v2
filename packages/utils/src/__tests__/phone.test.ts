import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../phone'

describe('normalizePhone', () => {
  it('formats 10-digit number with formatting chars (inserts leading 9)', () => {
    // (11) 9999-8888 → digits: 1199998888 (10d) → insert 9 → 11999998888 → 5511999998888
    expect(normalizePhone('(11) 9999-8888')).toBe('5511999998888')
  })

  it('inserts 9 after DDD for 10-digit number', () => {
    expect(normalizePhone('11 8888-7777')).toBe('5511988887777')
  })

  it('strips country code prefix and reformats', () => {
    expect(normalizePhone('+55 11 99999-8888')).toBe('5511999998888')
  })

  it('passes through already-normalized 13-digit number', () => {
    expect(normalizePhone('5511999998888')).toBe('5511999998888')
  })

  it('handles number without formatting', () => {
    expect(normalizePhone('11999998888')).toBe('5511999998888')
  })

  it('handles number with dots and dashes', () => {
    // 11.9999.8888 → digits: 1199998888 (10d) → insert 9 → 11999998888 → 5511999998888
    expect(normalizePhone('11.9999.8888')).toBe('5511999998888')
  })

  it('handles DDD 21 correctly', () => {
    expect(normalizePhone('21987654321')).toBe('5521987654321')
  })

  it('handles DDD 21 with 10 digits (landline)', () => {
    expect(normalizePhone('2187654321')).toBe('5521987654321')
  })
})
