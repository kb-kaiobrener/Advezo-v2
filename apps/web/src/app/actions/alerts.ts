'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@advezo/database'

/**
 * Server Action de resolução manual de alerta (Story 2.9 — T4 / AC 2.9.5 / 2.9.6b).
 *
 * `resolveAlert(alertId)`:
 *   1. auth guard → workspace do usuário (membership).
 *   2. ownership: o UPDATE escopa por id + workspace_id; um alerta de outro workspace
 *      não é encontrado e o resultado é "Alerta não encontrado" (sem vazar existência).
 *      A RLS de alerts já filtra por workspace na leitura; o .eq('workspace_id')
 *      reforça na escrita (mesmo padrão de campaigns.ts).
 *   3. Preenche resolved_at = now() apenas em alerta ainda ativo (resolved_at IS NULL)
 *      — idempotente: resolver um alerta já resolvido não é erro.
 *   4. revalidatePath nas páginas que exibem o badge/lista (settings + dashboard).
 *
 * Usa createSupabaseServerClient() (sessão do usuário) — NÃO o service-role: a ação
 * parte da UI autenticada e deve respeitar a RLS por workspace.
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

  return { supabase, workspaceId: membership.workspace_id as string }
}

export async function resolveAlert(alertId: string): Promise<{ error?: string }> {
  if (!alertId) return { error: 'Alerta inválido' }

  const { supabase, workspaceId } = await getAuthenticatedWorkspace()

  const { data, error } = await supabase
    .from('alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('workspace_id', workspaceId)
    .is('resolved_at', null)
    .select('id')

  if (error) {
    return { error: 'Falha ao resolver o alerta' }
  }

  // Sem linha afetada: ou o alerta não existe/é de outro workspace, ou já estava
  // resolvido. Resolver algo já resolvido é idempotente (não é erro de usuário); só
  // tratamos como "não encontrado" quando a linha não existe no workspace.
  if (!data || data.length === 0) {
    return { error: 'Alerta não encontrado' }
  }

  revalidatePath('/settings/integrations')
  revalidatePath('/dashboard')
  return {}
}
