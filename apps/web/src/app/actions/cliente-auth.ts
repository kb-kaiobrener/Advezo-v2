'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'

/** Login do cliente final (Story 3.8) — espelho de signInWithEmail, destino /cliente. */
export async function signInCliente(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: 'Email ou senha inválidos' }

  redirect('/cliente')
}

/**
 * Marca o convite como aceito (accepted_at) após o cliente definir a senha.
 * Usa a sessão corrente para identificar o usuário; service client para o UPDATE
 * (client_users tem RLS por workspace — o cliente não tem esse claim).
 */
export async function markClientInviteAccepted() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const serviceClient = createSupabaseServiceClient()
  await serviceClient
    .from('client_users')
    .update({ accepted_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('accepted_at', null)

  return { success: true }
}
