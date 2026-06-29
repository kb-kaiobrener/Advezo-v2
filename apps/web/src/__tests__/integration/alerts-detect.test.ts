import { describe, it } from 'vitest'

/**
 * Testes de integração (sandbox) — Detecção de saldo (Story 2.9 — AC 2.9.8 / T8).
 *
 * Esqueleto (it.todo) seguindo o padrão das Waves 1-2: os testes reais exigem
 * credenciais de sandbox (Meta Test Ad Account com saldo / Google Ads Test Customer
 * com account_budget) e Supabase, e são skipados sem elas. A lógica determinística
 * (projeção, deduplicação via constraint, resiliência) é coberta pela suíte unitária
 * (alerts-balance, alerts-detect, alerts-balance-fetch).
 *
 * Pré-requisitos de execução:
 *  - META_TEST_AD_ACCOUNT_ID + access_token de teste (campo balance acessível).
 *  - GOOGLE_ADS_TEST_CUSTOMER_ID + developer-token + refresh_token (account_budget).
 *  - TOKEN_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

const hasSandboxCredentials = !!(
  process.env.META_TEST_AD_ACCOUNT_ID &&
  process.env.TOKEN_ENCRYPTION_KEY &&
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

describe.runIf(hasSandboxCredentials)('Detecção de saldo — sandbox', () => {
  it.todo('busca o saldo real na Meta Test Ad Account e calcula projected_days')
  it.todo('cria alerta low_balance quando o saldo de teste projeta < 7 dias')
  it.todo('a constraint parcial bloqueia o 2º alerta ativo da mesma conta (dedup no DB)')
  it.todo('resolve o alerta automaticamente quando o saldo de teste recupera (>= 14 dias)')
})

describe.skipIf(hasSandboxCredentials)('Detecção de saldo — sandbox (env não configurado)', () => {
  it.todo(
    'requer META_TEST_AD_ACCOUNT_ID, TOKEN_ENCRYPTION_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'
  )
})
