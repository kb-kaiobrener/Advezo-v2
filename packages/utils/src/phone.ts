/**
 * Normalizes a Brazilian phone number to E.164 format (55 + DDD + 9 digits = 13 chars).
 * Strips non-digits → inserts 9 after DDD if 10 digits → prefixes 55.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  const with9 =
    digits.length === 10
      ? digits.slice(0, 2) + '9' + digits.slice(2)
      : digits

  return with9.startsWith('55') ? with9 : `55${with9}`
}
