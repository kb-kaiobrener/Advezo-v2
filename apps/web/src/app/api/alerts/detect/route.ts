import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'
import { detectAccountBalance, type AlertAccount } from '@/lib/alerts/detect'

/**
 * POST /api/alerts/detect  (Story 2.9 — AC 2.9.1 / 2.9.3) — cron endpoint.
 *
 * Guard: header `x-cron-secret` DEVE bater com process.env.CRON_SECRET → 401 caso
 * contrário (inclusive ausente). Acionado pelo cron Railway (schedule 0 7 * * * —
 * após o sync das 06:00, garantindo campaign_metrics atualizado).
 *
 * Itera TODAS as ad_accounts ativas (Meta + Google) e chama detectAccountBalance para
 * cada uma. Falhas individuais NÃO abortam o lote — detectAccountBalance registra a
 * falha em sync_errors (error_type='alert_detection_failed') e devolve ok:false em vez
 * de lançar (AC 2.9.3 + requisito explícito do QA: API de saldo indisponível em uma
 * conta não impede o processamento das demais).
 *
 * ARCH-1: usa createSupabaseServiceClient() (service-role, ignora RLS). O cron Railway
 * não carrega sessão → sem JWT, auth_workspace_id() seria NULL e as policies RLS
 * bloqueariam tanto a leitura das contas quanto as escritas em alerts/sync_errors.
 */

interface AccountResult {
  id: string
  external_account_id: string
  ok: boolean
  action?: 'created' | 'resolved' | 'none'
  error?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret')

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: accounts } = await supabase
    .from('ad_accounts')
    .select('id, workspace_id, platform, external_account_id, encrypted_token')
    .eq('status', 'active')

  const targets = (accounts ?? []) as AlertAccount[]
  const results: AccountResult[] = []
  let created = 0
  let resolved = 0
  let errors = 0

  for (const account of targets) {
    // detectAccountBalance NUNCA lança — mas o try/catch protege contra qualquer
    // exceção inesperada fora do contrato (defesa em profundidade: loop não para).
    let result
    try {
      result = await detectAccountBalance(account, supabase)
    } catch (err) {
      result = {
        accountId: account.id,
        ok: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      }
    }

    if (!result.ok) errors += 1
    else if (result.action === 'created') created += 1
    else if (result.action === 'resolved') resolved += 1

    results.push({
      id: account.id,
      external_account_id: account.external_account_id,
      ok: result.ok,
      action: result.action,
      error: result.error,
    })
  }

  return NextResponse.json({ created, resolved, errors, accounts: results })
}
