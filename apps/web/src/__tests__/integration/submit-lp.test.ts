import { describe, it } from 'vitest'

/**
 * Teste de integração (stub) — POST /api/leads/submit em ambiente real (Story 8.3 — T10).
 *
 * Roda apenas quando as credenciais de Supabase + chave de criptografia estão presentes
 * (padrão describe.runIf de docs/architecture.md Seção 10). Sem credenciais, o bloco é
 * pulado — a suíte unitária cobre a lógica determinística (gate de consent, crypto,
 * rate limit, dedup).
 *
 * Pré-requisitos para rodar (contra um Supabase real/sandbox):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY
 * e um lead_form ativo com embed_token conhecido (LEAD_FORM_EMBED_TOKEN).
 */

const hasIntegrationCreds = !!(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.TOKEN_ENCRYPTION_KEY &&
  process.env.LEAD_FORM_EMBED_TOKEN
)

describe.runIf(hasIntegrationCreds)('POST /api/leads/submit — integração real', () => {
  // Submete contra um Supabase real e verifica persistência:
  //  - 201 com lead_id; row em leads com phone_hash (HMAC) e source='landing_page'.
  //  - consent=true → email_encrypted decriptável + consent_given_at não nulo.
  //  - consent ausente + email → 422 sem persistir (gate LGPD).
  //  - segundo POST mesmo phone → 409 (leads_active_dedup).
  it.todo('persiste lead, aplica gate de consent e dedup contra Supabase real')
})

describe.skipIf(hasIntegrationCreds)(
  'POST /api/leads/submit — integração (env não configurado)',
  () => {
    it.todo(
      'requer SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY e LEAD_FORM_EMBED_TOKEN'
    )
  }
)
