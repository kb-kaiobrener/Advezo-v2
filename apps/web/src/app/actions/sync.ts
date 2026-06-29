'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'
import { syncMetaAccount } from '@/lib/sync/meta'
import { syncGoogleAccount } from '@/lib/sync/google'

/**
 * Server Action de sync manual (Story 2.3 — AC 2.3.5 / 2.3.6).
 *
 * Protegida por sessão autenticada (supabase.auth.getUser()) — NÃO usa CRON_SECRET.
 * Acionada pelo botão "Sincronizar agora" na página de integrações. Chama
 * syncMetaAccount diretamente para a conta selecionada e revalida a página para
 * refletir last_synced_at atualizado (ou status de erro inline no AdAccountCard).
 */

async function getAuthenticatedWorkspace() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  return { supabase, user, workspaceId: membership.workspace_id }
}

export async function syncMetaAccountNow(
  adAccountId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await getAuthenticatedWorkspace()

  try {
    await syncMetaAccount(adAccountId, workspaceId)
  } catch (err) {
    // syncMetaAccount já registrou em sync_errors e atualizou ad_accounts.status (NFR-4).
    revalidatePath('/settings/integrations')
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Erro ao sincronizar. Tente novamente.',
    }
  }

  revalidatePath('/settings/integrations')
  return {}
}

export async function syncGoogleAccountNow(
  adAccountId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await getAuthenticatedWorkspace()

  try {
    // Caminho manual: sessão de usuário presente → client cookie-based default.
    await syncGoogleAccount(adAccountId, workspaceId)
  } catch (err) {
    // syncGoogleAccount já registrou em sync_errors e atualizou ad_accounts.status (NFR-4).
    revalidatePath('/settings/integrations')
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Erro ao sincronizar. Tente novamente.',
    }
  }

  revalidatePath('/settings/integrations')
  return {}
}
