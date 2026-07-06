'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

const LOGO_BUCKET = 'dashboard-logos'
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_LOGO_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/**
 * Resolve o workspace do usuário autenticado (mesmo padrão de whatsapp.ts).
 * Usa service-client apenas para ler workspace_members após validar a sessão.
 */
async function getWorkspaceMembership() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const, membership: null }

  const serviceClient = createSupabaseServiceClient()
  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return { error: 'Workspace não encontrado' as const, membership: null }
  return { error: null, membership }
}

/**
 * Cria ou atualiza a config de dashboard de um cliente (AC 3.7.1 / 3.7.2 / 3.7.6).
 *
 * - Token: gerado UMA vez (DEFAULT da migration). Re-save preserva o token existente
 *   — reconfigurar métricas/senha nunca gera novo link.
 * - Senha: se fornecida, gera salt aleatório + HMAC-SHA256(password + salt, secret).
 *   Se vazia/null, limpa password_hash e password_salt (dashboard volta a ser público).
 * - Reativação: um upsert sobre config desativada mantém o mesmo token e volta is_active=true.
 */
export async function saveDashboardConfig(
  clientId: string,
  data: { selected_metrics: string[]; password?: string | null }
) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const workspaceId = membership!.workspace_id
  const serviceClient = createSupabaseServiceClient()

  // Busca config existente para preservar o token (não gerar novo em re-save/reativação).
  const { data: existing } = await serviceClient
    .from('dashboard_configs')
    .select('token')
    .eq('workspace_id', workspaceId)
    .eq('client_id', clientId)
    .maybeSingle()

  const hasPassword = typeof data.password === 'string' && data.password.length > 0
  let passwordHash: string | null = null
  let passwordSalt: string | null = null

  if (hasPassword) {
    const secret = process.env.DASHBOARD_AUTH_SECRET
    if (!secret) return { error: 'DASHBOARD_AUTH_SECRET não configurada' }
    passwordSalt = crypto.randomBytes(8).toString('hex')
    passwordHash = crypto
      .createHmac('sha256', secret)
      .update(data.password! + passwordSalt)
      .digest('hex')
  }

  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    client_id: clientId,
    selected_metrics: data.selected_metrics,
    password_hash: passwordHash,
    password_salt: passwordSalt,
    is_active: true,
  }
  // Só reencaminha o token quando já existe — deixa o DEFAULT gerar na primeira vez.
  if (existing?.token) row.token = existing.token

  const { data: saved, error: dbError } = await serviceClient
    .from('dashboard_configs')
    .upsert(row, { onConflict: 'workspace_id,client_id' })
    .select('token')
    .single()

  if (dbError || !saved) return { error: 'Erro ao salvar configuração do dashboard' }

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true as const, token: saved.token as string }
}

/**
 * Desativa o link público do dashboard (AC 3.7.6).
 * is_active=false → a rota pública responde 404. O token é preservado para reativação.
 */
export async function deactivateDashboard(clientId: string) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const serviceClient = createSupabaseServiceClient()
  const { error: dbError } = await serviceClient
    .from('dashboard_configs')
    .update({ is_active: false })
    .eq('workspace_id', membership!.workspace_id)
    .eq('client_id', clientId)

  if (dbError) return { error: 'Erro ao desativar dashboard' }

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true as const }
}

/**
 * Faz upload do logo da agência para o bucket público dashboard-logos (AC 3.7.7).
 * Valida tamanho (≤ 2MB) e mime (png/jpeg) ANTES do upload. Persiste a URL pública.
 */
export async function uploadDashboardLogo(clientId: string, formData: FormData) {
  const { error, membership } = await getWorkspaceMembership()
  if (error) return { error }

  const file = formData.get('logo')
  if (!(file instanceof File)) return { error: 'Arquivo de logo ausente' }

  if (file.size > MAX_LOGO_BYTES) return { error: 'Logo excede o tamanho máximo de 2MB' }

  const ext = ALLOWED_LOGO_MIME[file.type]
  if (!ext) return { error: 'Formato inválido — use PNG ou JPEG' }

  const workspaceId = membership!.workspace_id
  const serviceClient = createSupabaseServiceClient()
  const path = `${workspaceId}/${clientId}/logo.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await serviceClient.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (uploadError) return { error: 'Erro ao enviar o logo' }

  const { data: publicUrlData } = serviceClient.storage.from(LOGO_BUCKET).getPublicUrl(path)
  const publicUrl = publicUrlData.publicUrl

  const { error: dbError } = await serviceClient
    .from('dashboard_configs')
    .update({ logo_url: publicUrl })
    .eq('workspace_id', workspaceId)
    .eq('client_id', clientId)

  if (dbError) return { error: 'Erro ao salvar o logo' }

  revalidatePath(`/clients/${clientId}/configuracoes`)
  return { success: true as const, logoUrl: publicUrl }
}
