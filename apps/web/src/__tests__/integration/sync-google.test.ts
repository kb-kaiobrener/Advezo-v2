import { describe, it } from 'vitest'

/**
 * Teste de integração (sandbox) — Sync Google (Story 2.4 — AC 2.4.10 / T6)
 *
 * Roda apenas quando as credenciais de sandbox do Google Ads + Supabase estão
 * presentes (padrão describe.runIf de docs/architecture.md Seção 10). Sem credenciais,
 * o bloco é pulado — a suíte unitária cobre a lógica determinística.
 *
 * Pré-requisitos para rodar:
 *   GOOGLE_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_TEST_CUSTOMER_ID,
 *   TOKEN_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTA (AC 2.4.8 / PC-03): no sandbox, a conta de teste pode retornar zero campanhas
 * — o sync deve completar sem erro mesmo com results vazio.
 */

const hasSandboxCredentials = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
  process.env.GOOGLE_ADS_TEST_CUSTOMER_ID &&
  process.env.TOKEN_ENCRYPTION_KEY &&
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

describe.runIf(hasSandboxCredentials)('Sync Google — sandbox', () => {
  // Sync real com Google Ads Test Customer: completa sem erro (results pode ser vazio),
  // last_synced_at atualizado. Implementação completa quando o sandbox estiver provisionado.
  it.todo('sincroniza campanhas/métricas do test customer e atualiza last_synced_at')
})

describe.skipIf(hasSandboxCredentials)('Sync Google — sandbox (env não configurado)', () => {
  it.todo(
    'requer GOOGLE_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_TEST_CUSTOMER_ID, TOKEN_ENCRYPTION_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'
  )
})
