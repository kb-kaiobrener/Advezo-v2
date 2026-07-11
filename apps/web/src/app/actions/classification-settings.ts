'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

/** Story 5.6 — limiar de confiança p/ revisão manual (workspace_settings). */
export async function saveClassificationThreshold(value: number) {
  // AC 5.6.5: mínimo 0.5 (o CHECK do banco é o backstop)
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0.5 || value > 1) {
    return { error: 'Limiar deve estar entre 0.5 e 1.0' }
  }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createSupabaseServiceClient()
  const { data: membership } = await service
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single()
  if (!membership) return { error: 'Workspace não encontrado' }

  const { error } = await service
    .from('workspace_settings')
    .update({ classification_confidence_threshold: value })
    .eq('workspace_id', membership.workspace_id)
  if (error) return { error: 'Erro ao salvar limiar' }

  revalidatePath('/settings/rastreamento')
  return { success: true }
}
