import { describe, it } from 'vitest'

/**
 * Teste de integração (sandbox) — Sync Meta (Story 2.3 — AC 2.3.10 / T7)
 *
 * Roda apenas quando as credenciais de sandbox da Meta + Supabase estão presentes
 * (padrão describe.runIf de docs/architecture.md Seção 10). Sem credenciais, o bloco
 * é pulado — a suíte unitária cobre a lógica determinística.
 *
 * Pré-requisitos para rodar:
 *   META_APP_ID, META_TEST_AD_ACCOUNT_ID, TOKEN_ENCRYPTION_KEY,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const hasSandboxCredentials = !!(
  process.env.META_APP_ID &&
  process.env.META_TEST_AD_ACCOUNT_ID &&
  process.env.TOKEN_ENCRYPTION_KEY &&
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

describe.runIf(hasSandboxCredentials)('Sync Meta — sandbox', () => {
  // Sync real com Meta Test Ad Account: campaign_metrics populado, last_synced_at
  // atualizado. Implementação completa quando o app de sandbox estiver provisionado.
  it.todo('sincroniza campanhas/métricas reais e atualiza last_synced_at')
})

describe.skipIf(hasSandboxCredentials)('Sync Meta — sandbox (env não configurado)', () => {
  it.todo(
    'requer META_APP_ID, META_TEST_AD_ACCOUNT_ID, TOKEN_ENCRYPTION_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'
  )
})
