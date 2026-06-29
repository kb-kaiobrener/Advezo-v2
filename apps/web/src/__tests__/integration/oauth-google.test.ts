import { describe, it } from 'vitest'

/**
 * Teste de integração (sandbox) — OAuth Google Ads (Story 2.2 — AC 2.2.10)
 *
 * Roda apenas quando as credenciais de sandbox do Google estão presentes no ambiente
 * (padrão describe.runIf de docs/architecture.md Seção 10.1). Sem credenciais, o
 * bloco inteiro é pulado — a suíte unitária cobre a lógica determinística.
 *
 * Pré-requisitos para rodar:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN,
 *   GOOGLE_ADS_TEST_CUSTOMER_ID, TOKEN_ENCRYPTION_KEY
 */

const hasSandboxCredentials = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
  process.env.GOOGLE_ADS_TEST_CUSTOMER_ID &&
  process.env.TOKEN_ENCRYPTION_KEY
)

describe.runIf(hasSandboxCredentials)('OAuth Google — sandbox', () => {
  // Implementação completa do fluxo end-to-end com Google Ads Test Account
  // será adicionada quando o app de sandbox estiver provisionado (PC-03).
  it.todo(
    'troca code → access_token + refresh_token, criptografa ambos e persiste no banco'
  )
  it.todo(
    'lista customer_ids via GOOGLE_ADS_TEST_CUSTOMER_ID e faz upsert com platform=google'
  )
})

describe.skipIf(hasSandboxCredentials)('OAuth Google — sandbox (env não configurado)', () => {
  it.todo(
    'requer GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_TEST_CUSTOMER_ID e TOKEN_ENCRYPTION_KEY'
  )
})
