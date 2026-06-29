import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'
import { syncGoogleAccount } from '@/lib/sync/google'

/**
 * POST /api/sync/google  (Story 2.4 — AC 2.4.3) — cron endpoint.
 *
 * Guard: header `x-cron-secret` DEVE bater com process.env.CRON_SECRET → 401 caso
 * contrário (inclusive ausente). Acionado pelo cron Railway (schedule 0 6 * * *).
 *
 * Itera todas as ad_accounts ativas com platform='google' e chama syncGoogleAccount
 * para cada uma. Falhas individuais NÃO abortam o lote — cada conta é registrada em
 * sync_errors pela própria syncGoogleAccount (NFR-4). Retorna o resumo agregado.
 *
 * ARCH-1: usa createSupabaseServiceClient() desde o início (service-role, ignora RLS).
 * O cron Railway não carrega sessão → sem JWT, auth_workspace_id() seria NULL e as
 * policies RLS bloqueariam as escritas. O mesmo client é injetado em syncGoogleAccount.
 */

interface AccountResult {
  id: string
  external_account_id: string
  ok: boolean
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
    .select('id, workspace_id, external_account_id')
    .eq('platform', 'google')
    .eq('status', 'active')

  const targets = accounts ?? []
  const results: AccountResult[] = []
  let synced = 0
  let errors = 0

  for (const account of targets) {
    try {
      await syncGoogleAccount(account.id, account.workspace_id, supabase)
      synced += 1
      results.push({
        id: account.id,
        external_account_id: account.external_account_id,
        ok: true,
      })
    } catch (err) {
      errors += 1
      results.push({
        id: account.id,
        external_account_id: account.external_account_id,
        ok: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    }
  }

  return NextResponse.json({ synced, errors, accounts: results })
}
