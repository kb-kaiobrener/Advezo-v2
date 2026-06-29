import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from '../crypto'

describe('encryptToken / decryptToken', () => {
  const testKey = '0'.repeat(64) // 32 bytes em hex — apenas para testes

  it('roundtrip: encrypt → decrypt retorna o valor original', () => {
    const plaintext = 'EAAGm0PX4ZCpsBO_meta_oauth_long_lived_token_example'
    const encrypted = encryptToken(plaintext, testKey)
    expect(decryptToken(encrypted, testKey)).toBe(plaintext)
  })

  it('dois encrypts do mesmo plaintext geram ciphertexts diferentes (IV aleatório)', () => {
    const plaintext = 'same-token-value'
    const a = encryptToken(plaintext, testKey)
    const b = encryptToken(plaintext, testKey)
    expect(a).not.toBe(b)
    // ambos ainda decriptam para o mesmo valor original
    expect(decryptToken(a, testKey)).toBe(plaintext)
    expect(decryptToken(b, testKey)).toBe(plaintext)
  })

  it('decryptToken falha com ciphertext adulterado (GCM auth tag)', () => {
    const encrypted = encryptToken('sensitive', testKey)
    const [iv, tag, ct] = encrypted.split(':')
    // Adultera o último byte do ciphertext
    const tamperedCt = ct.slice(0, -2) + (ct.slice(-2) === 'ff' ? '00' : 'ff')
    const tampered = [iv, tag, tamperedCt].join(':')
    expect(() => decryptToken(tampered, testKey)).toThrow()
  })

  it('encryptToken lança se key não tem 32 bytes', () => {
    const shortKey = '0'.repeat(32) // 16 bytes — inválido
    expect(() => encryptToken('x', shortKey)).toThrow(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)'
    )
  })

  it('decryptToken lança se formato inválido (sem separadores)', () => {
    expect(() => decryptToken('not-a-valid-ciphertext', testKey)).toThrow(
      'Invalid ciphertext format'
    )
  })
})
