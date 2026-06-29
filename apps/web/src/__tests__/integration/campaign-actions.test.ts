import { describe, it } from 'vitest'

/**
 * Testes de integração — Ações inline de campanha (Story 2.7 — AC 2.7.10).
 *
 * Esqueleto (it.todo) seguindo o padrão das Waves 1-2: os testes reais exigem
 * credenciais de sandbox (Meta Test Ad Account / Google Ads Test Customer) e são
 * skipados sem elas. Implementar quando as credenciais de teste estiverem disponíveis.
 *
 * Pré-requisitos de execução:
 *  - META_TEST_AD_ACCOUNT_ID + access_token de teste com a campanha de teste.
 *  - GOOGLE_ADS_TEST_CUSTOMER_ID + developer-token + refresh_token de teste.
 *  - TOKEN_ENCRYPTION_KEY configurada.
 */

describe('Ações inline — integração com sandbox (Story 2.7 AC 2.7.10)', () => {
  it.todo('pausa uma campanha real na Meta Test Ad Account e reflete status=paused')
  it.todo('ativa uma campanha real na Meta Test Ad Account e reflete status=active')
  it.todo('ajusta o orçamento diário de uma campanha Meta de teste (centavos)')
  it.todo('pausa uma campanha real no Google Ads Test Customer (campaigns:mutate)')
  it.todo('renova o access_token Google em 401 e re-tenta a mutação')
  it.todo('falha de API real preserva o estado local e grava action_log failed')
})
