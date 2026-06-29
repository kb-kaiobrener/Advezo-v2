/**
 * Busca de saldo de conta Meta Ads (Story 2.9 — CP5).
 *
 * CP5: o saldo é obtido por chamada REAL à Graph API, NÃO derivado de daily_budget
 * local. O cenário real de alerta é "a conta ficou sem saldo na plataforma",
 * independente do orçamento configurado nas campanhas.
 *
 * Meta: GET /{act_XXXX}?fields=balance → campo `balance` em CENTAVOS (string). Dividir
 * por 100 para BRL. Mantém GRAPH_VERSION v19.0 (paridade com lib/sync/meta.ts).
 *
 * Falhas (HTTP != 2xx, rede, timeout, payload inesperado) PROPAGAM como Error — o
 * caller (cron) registra em sync_errors com error_type='alert_detection_failed' e
 * segue para a próxima conta. NUNCA inclui o access_token na mensagem de erro.
 */

const GRAPH_BASE = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v19.0'

interface MetaBalanceResponse {
  balance?: string | number
  error?: { message?: string; code?: number }
}

/**
 * Retorna o saldo disponível da conta Meta em BRL (reais).
 *
 * @param actId       external_account_id no formato act_123456 (prefixo preservado).
 * @param accessToken access_token JÁ descriptografado (responsabilidade do caller).
 */
export async function fetchMetaBalance(
  actId: string,
  accessToken: string
): Promise<number> {
  const params = new URLSearchParams({
    fields: 'balance',
    access_token: accessToken,
  })
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${actId}?${params.toString()}`

  const res = await fetch(url)

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as MetaBalanceResponse
    // Mensagem da API sem token (a URL com token nunca entra na mensagem).
    throw new Error(body.error?.message ?? `Meta balance API error (HTTP ${res.status})`)
  }

  const body = (await res.json()) as MetaBalanceResponse
  if (body.balance == null) {
    throw new Error('Resposta da Meta sem campo balance')
  }

  // balance vem em centavos → BRL.
  const cents = Number(body.balance)
  if (!Number.isFinite(cents)) {
    throw new Error('Saldo Meta inválido')
  }
  return cents / 100
}
