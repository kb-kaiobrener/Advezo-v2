'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { decryptToken } from '@advezo/utils'

const STAGES = ['awareness', 'interest', 'consideration', 'intent', 'sale'] as const
export type FunnelStage = (typeof STAGES)[number]

async function getMembership() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const, user: null, ws: null }
  const svc = createSupabaseServiceClient()
  const { data: m } = await svc.from('workspace_members')
    .select('workspace_id').eq('user_id', user.id).limit(1).single()
  if (!m) return { error: 'Workspace não encontrado' as const, user: null, ws: null }
  return { error: null, user, ws: m.workspace_id as string }
}

/**
 * Story 5.4 — confirmar ou corrigir classificação (AC 5.4.3/5.4.4).
 * Confirmar: mantém valores da IA; Corrigir: sobrescreve stage/is_sale/valor.
 * Ambos gravam reviewed_by + reviewed_at (gate NFR-6 usa reviewed_by).
 */
export async function reviewClassification(
  classificationId: string,
  data: { action: 'confirm' } | { action: 'correct'; funnel_stage: FunnelStage; is_sale: boolean; sale_value_estimate: number | null }
) {
  if (data.action === 'correct' && !STAGES.includes(data.funnel_stage)) {
    return { error: 'Etapa de funil inválida' }
  }
  const { error, user, ws } = await getMembership()
  if (error) return { error }

  const svc = createSupabaseServiceClient()
  const patch: Record<string, unknown> = {
    reviewed_by: user!.id,
    reviewed_at: new Date().toISOString(),
  }
  if (data.action === 'correct') {
    patch.funnel_stage = data.funnel_stage
    patch.is_sale = data.is_sale
    patch.sale_value_estimate = data.sale_value_estimate
  }
  const { error: dbErr } = await svc.from('conversation_classifications')
    .update(patch).eq('id', classificationId).eq('workspace_id', ws!)
  if (dbErr) return { error: 'Erro ao salvar revisão' }
  revalidatePath('/rastreamento/revisao')
  return { success: true }
}

/**
 * Trecho da conversa p/ revisão (AC 5.4.2) — decisão 3 da migration 000024:
 * conversation_messages não tem grant p/ authenticated; o trecho é servido
 * por esta action (service role + membership), decriptado EM MEMÓRIA.
 */
export async function getConversationExcerpt(conversationId: string): Promise<{ excerpt?: string[]; error?: string }> {
  const { error, ws } = await getMembership()
  if (error) return { error }

  const svc = createSupabaseServiceClient()
  // conversa precisa ser do workspace do gestor (IDOR)
  const { data: conv } = await svc.from('tracked_conversations')
    .select('id').eq('id', conversationId).eq('workspace_id', ws!).maybeSingle()
  if (!conv) return { error: 'Conversa não encontrada' }

  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) return { error: 'Chave de decriptação não configurada' }

  const { data: msgs } = await svc.from('conversation_messages')
    .select('direction, content_encrypted')
    .eq('conversation_id', conversationId)
    .order('message_at', { ascending: false }).limit(6)

  const excerpt = (msgs ?? []).reverse().map((m: { direction: string; content_encrypted: string }) => {
    try {
      return `${m.direction === 'in' ? 'Lead' : 'Atendente'}: ${decryptToken(m.content_encrypted, key)}`
    } catch { return '[mensagem indecriptável]' }
  })
  return { excerpt }
}
