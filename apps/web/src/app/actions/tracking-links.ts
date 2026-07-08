'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

export type TrackingSourceType = 'meta_ad' | 'google_ad' | 'custom'

export interface TrackingLink {
  id: string
  workspace_id: string
  client_id: string
  code: string
  source_type: TrackingSourceType
  source_meta: Record<string, string>
  destination_whatsapp: string
  active: boolean
  created_at: string
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // sem 0/O/1/l/i — legibilidade em QR

/** 8 chars alfanuméricos, aleatórios (AC 4.2.2). Exportado para teste. */
export async function generateTrackingCode(): Promise<string> {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}

async function getWorkspaceMembership() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const, membership: null }
  const serviceClient = createSupabaseServiceClient()
  const { data: membership } = await serviceClient
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single()
  if (!membership) return { error: 'Workspace não encontrado' as const, membership: null }
  return { error: null, membership }
}

export async function createTrackingLink(data: {
  client_id: string
  source_type: TrackingSourceType
  source_meta: Record<string, string>
  destination_whatsapp: string
  code?: string
}) {
  // validações pré-auth (padrão 3.3/3.6)
  const normalized = data.destination_whatsapp.replace(/[+\s]/g, '')
  if (!/^\d{10,15}$/.test(normalized)) {
    return { error: 'Número de WhatsApp inválido — use E.164 (ex: 5511999998888)' }
  }
  const code = (data.code?.trim() || (await generateTrackingCode())).toLowerCase()
  if (!/^[a-z0-9-]{4,32}$/.test(code)) {
    return { error: 'Código inválido — 4 a 32 caracteres, letras minúsculas, números e hífen' }
  }

  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  // cliente precisa pertencer ao workspace (IDOR)
  const { data: client } = await serviceClient
    .from('clients').select('id').eq('id', data.client_id)
    .eq('workspace_id', membership!.workspace_id).is('deleted_at', null).maybeSingle()
  if (!client) return { error: 'Cliente não encontrado' }

  const { error: dbError } = await serviceClient.from('tracking_links').insert({
    workspace_id: membership!.workspace_id,
    client_id: data.client_id,
    code,
    source_type: data.source_type,
    source_meta: data.source_meta,
    destination_whatsapp: normalized,
  })
  if (dbError) {
    return { error: dbError.code === '23505' ? 'Este código já está em uso — escolha outro' : 'Erro ao criar link' }
  }
  revalidatePath('/rastreamento')
  return { success: true, code }
}

/** AC 4.2.7: só source_meta e destination_whatsapp editáveis — code NUNCA. */
export async function updateTrackingLink(linkId: string, data: {
  source_meta: Record<string, string>
  destination_whatsapp: string
}) {
  const normalized = data.destination_whatsapp.replace(/[+\s]/g, '')
  if (!/^\d{10,15}$/.test(normalized)) {
    return { error: 'Número de WhatsApp inválido — use E.164 (ex: 5511999998888)' }
  }
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('tracking_links')
    .update({ source_meta: data.source_meta, destination_whatsapp: normalized })
    .eq('id', linkId).eq('workspace_id', membership!.workspace_id)
  if (dbError) return { error: 'Erro ao atualizar link' }
  revalidatePath('/rastreamento')
  return { success: true }
}

/** AC 4.2.5: toggle sem excluir histórico. */
export async function toggleTrackingLink(linkId: string, active: boolean) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }
  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('tracking_links').update({ active })
    .eq('id', linkId).eq('workspace_id', membership!.workspace_id)
  if (dbError) return { error: 'Erro ao alterar status' }
  revalidatePath('/rastreamento')
  return { success: true }
}
