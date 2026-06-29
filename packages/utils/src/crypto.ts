import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

/**
 * AES-256-GCM token encryption for ad-account OAuth tokens (NFR-1).
 *
 * Output format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *   - IV:       12 bytes (96 bits) — random per operation, recommended for GCM.
 *   - Auth Tag: 16 bytes (128 bits) — GCM integrity guarantee; decrypt fails if tampered.
 *   - Key:      32 bytes (256 bits) — from env var TOKEN_ENCRYPTION_KEY (hex).
 *
 * Usage (Story 2.1):
 *   const encrypted = encryptToken(accessToken, process.env.TOKEN_ENCRYPTION_KEY!)
 *   // Supabase: encrypted_token = encrypted
 *   const token = decryptToken(row.encrypted_token, process.env.TOKEN_ENCRYPTION_KEY!)
 *
 * SECURITY: TOKEN_ENCRYPTION_KEY MUST differ across dev/staging/prod (NFR-7) and
 * MUST never be exposed via NEXT_PUBLIC_*.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // bytes (96 bits — recommended for GCM)
const TAG_LENGTH = 16 // bytes (128 bits)
const KEY_LENGTH = 32 // bytes (256 bits)

export function encryptToken(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== KEY_LENGTH)
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptToken(ciphertext: string, keyHex: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext format')

  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== KEY_LENGTH)
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
