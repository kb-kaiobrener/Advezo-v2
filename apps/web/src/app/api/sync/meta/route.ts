import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'
import { syncMetaAccount } from '@/lib/sync/meta'

/**
 * POST /api/sync/meta  (Story 2.3 — AC 2.3.4) — cron endpoint.
 *
 * Guard: header `x-cron-secret` DEVE bater com process.env.CRON_SECRET → 401 caso
 * contrário (inclusive ausente). Acionado pelo cron Railway (schedule 0 6 * * *).
 *
 * Itera todas as ad_accounts ativas com platform='meta' e chama syncMetaAccount
 * para cada uma. Falhas individuais NÃO abortam o lote — cada conta é registrada
 * em sync_errors pela própria syncMetaAccount (NFR-4). Retorna o resumo agregado.
 *
 * ARCH-1 (fix do Quality Gate da Story 2.3): o cron Railway não carrega sessão de
 * usuário → sem JWT, `auth_workspace_id()` é NULL e as policies RLS bloqueiam as
 * escritas silenciosamente. Aqui usamos `createSupabaseServiceClient()` (service-role,
 * ignora RLS) tanto para LISTAR todas as contas quanto, por injeção de dependência,
 * para que `syncMetaAccount` faça os upserts com o mesmo client privilegiado.
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
    .eq('platform', 'meta')
    .eq('status', 'active')

  const targets = accounts ?? []
  const results: AccountResult[] = []
  let synced = 0
  let errors = 0

  for (const account of targets) {
    try {
      await syncMetaAccount(account.id, account.workspace_id, supabase)
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
