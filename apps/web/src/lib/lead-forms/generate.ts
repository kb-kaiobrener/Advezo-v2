import { randomBytes } from 'crypto'

/**
 * Geração de embed_token e slug para lead_forms (Story 8.2 — AC 8.2.2).
 *
 * SEGURANÇA: embed_token é sempre 128 bits aleatórios (nunca sequencial, nunca derivado
 * do slug ou do nome) e NUNCA deve ser logado. Constraint UNIQUE no banco garante
 * unicidade global — em colisão (probabilidade ~2^-128) o chamador deve repetir.
 */
export function generateEmbedToken(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * Slug a partir do nome: lowercase, sem acentos, kebab-case. UNIQUE (workspace_id, slug)
 * no banco — colisão resolvida pelo chamador com appendSlugSuffix.
 */
export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (acentos)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Nome só com caracteres não-alfanuméricos → fallback para não gerar slug vazio.
  return slug || 'formulario'
}

/** Sufixo aleatório de 4 chars hex para resolver colisão de slug por workspace. */
export function appendSlugSuffix(slug: string): string {
  return `${slug}-${randomBytes(2).toString('hex')}`
}
