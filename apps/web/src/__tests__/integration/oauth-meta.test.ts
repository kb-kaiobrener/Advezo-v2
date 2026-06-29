import { describe, it } from 'vitest'

/**
 * Teste de integração (sandbox) — OAuth Meta (Story 2.1 — AC 2.1.10)
 *
 * Roda apenas quando as credenciais de sandbox da Meta estão presentes no ambiente
 * (padrão describe.runIf de docs/architecture.md Seção 10.1). Sem credenciais, o
 * bloco inteiro é pulado — a suíte unitária cobre a lógica determinística.
 *
 * Pré-requisitos para rodar:
 *   META_APP_ID, META_APP_SECRET, META_TEST_AD_ACCOUNT_ID, TOKEN_ENCRYPTION_KEY
 */

const hasSandboxCredentials = !!(
  process.env.META_APP_ID &&
  process.env.META_APP_SECRET &&
  process.env.META_TEST_AD_ACCOUNT_ID &&
  process.env.TOKEN_ENCRYPTION_KEY
)

describe.runIf(hasSandboxCredentials)('OAuth Meta — sandbox', () => {
  // Implementação completa do fluxo end-to-end com Meta Test Ad Account
  // será adicionada quando o app de sandbox estiver provisionado (PC-01).
  it.todo(
    'troca code → long-lived token, lista contas e persiste encrypted_token no banco'
  )
})

describe.skipIf(hasSandboxCredentials)('OAuth Meta — sandbox (env não configurado)', () => {
  it.todo('requer META_APP_ID, META_APP_SECRET, META_TEST_AD_ACCOUNT_ID e TOKEN_ENCRYPTION_KEY')
})
