import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client (ARCH-1 — fix do Quality Gate da Story 2.3).
 *
 * Os endpoints de cron (Railway) NÃO carregam sessão de usuário: sem JWT,
 * `auth_workspace_id()` retorna NULL e as policies RLS `workspace_id = auth_workspace_id()`
 * bloqueiam silenciosamente todas as escritas. Este client usa a SERVICE_ROLE_KEY,
 * que ignora RLS — destinado EXCLUSIVAMENTE a caminhos server-side de confiança
 * (cron, scheduled jobs).
 *
 * SECURITY (NFR-1 / NFR-7):
 *  - NUNCA usar em Client Components nem expor a chave via NEXT_PUBLIC_*.
 *  - SUPABASE_SERVICE_ROLE_KEY ignora RLS — o caller é responsável por escopar
 *    todas as queries por workspace_id explicitamente.
 *
 * A URL pode vir de SUPABASE_URL (server-only) ou, em fallback, de
 * NEXT_PUBLIC_SUPABASE_URL — a URL do projeto é pública por natureza; apenas a
 * service-role key é secreta.
 */
export function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) não configurada')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
