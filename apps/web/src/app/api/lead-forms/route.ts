import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'
import { createLeadFormSchema } from '@/lib/validation/lead-forms'
import {
  appendSlugSuffix,
  generateEmbedToken,
  generateSlug,
} from '@/lib/lead-forms/generate'

const MAX_TOKEN_ATTEMPTS = 3
const MAX_SLUG_ATTEMPTS = 5

/**
 * GET /api/lead-forms (Story 8.2 — AC 8.2.1).
 * Lista os formulários do workspace do usuário autenticado. RLS já restringe ao
 * workspace via auth_workspace_id(); aqui apenas filtramos os inativos (soft-deleted).
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('lead_forms')
    .select(
      'id, workspace_id, client_id, ad_account_id, name, slug, embed_token, fields, qualification_rules, allowed_origins, is_active, created_at'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

/**
 * POST /api/lead-forms (Story 8.2 — AC 8.2.1 / 8.2.2 / 8.2.3).
 * Cria um formulário: gera embed_token (128 bits) e slug único por workspace.
 * Validação Zod inclui a regra LGPD de consent_checkbox vinculado ao email (422).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaceId = user.user_metadata?.workspace_id as string | undefined
  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Workspace não encontrado no token' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = createLeadFormSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 422 }
    )
  }

  const input = parsed.data
  const baseSlug = generateSlug(input.name)

  // Insere com retry: resolve colisão de slug (UNIQUE workspace_id,slug) e a colisão —
  // extremamente improvável — de embed_token (UNIQUE global). 23505 = unique_violation.
  let slug = baseSlug
  let lastError: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    let embedToken = generateEmbedToken()
    let inserted: unknown = null
    let insertError: { code?: string; message?: string } | null = null

    for (let tokenTry = 0; tokenTry < MAX_TOKEN_ATTEMPTS; tokenTry++) {
      const result = await supabase
        .from('lead_forms')
        .insert({
          workspace_id: workspaceId,
          client_id: input.client_id,
          ad_account_id: input.ad_account_id ?? null,
          name: input.name,
          slug,
          embed_token: embedToken,
          fields: input.fields,
          qualification_rules: input.qualification_rules,
          allowed_origins: input.allowed_origins ?? null,
          is_active: true,
        })
        .select(
          'id, workspace_id, client_id, ad_account_id, name, slug, embed_token, fields, qualification_rules, allowed_origins, is_active, created_at'
        )
        .single()

      if (!result.error) {
        inserted = result.data
        insertError = null
        break
      }

      insertError = result.error
      // Colisão de embed_token: regenera token e tenta de novo no mesmo slug.
      if (result.error.code === '23505' && isTokenConflict(result.error.message)) {
        embedToken = generateEmbedToken()
        continue
      }
      break
    }

    if (inserted) {
      return NextResponse.json(inserted, { status: 201 })
    }

    lastError = insertError
    // Colisão de slug por workspace: gera novo slug com sufixo e tenta de novo.
    if (insertError?.code === '23505') {
      slug = appendSlugSuffix(baseSlug)
      continue
    }
    break
  }

  return NextResponse.json(
    { error: lastError?.message ?? 'Falha ao criar formulário' },
    { status: 500 }
  )
}

/** Heurística: a UNIQUE violation veio do embed_token (vs slug)? */
function isTokenConflict(message?: string): boolean {
  return Boolean(message && message.toLowerCase().includes('embed_token'))
}
