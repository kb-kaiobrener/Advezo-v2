import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'
import { updateLeadFormSchema } from '@/lib/validation/lead-forms'

const SELECT_COLUMNS =
  'id, workspace_id, client_id, ad_account_id, name, slug, embed_token, fields, qualification_rules, allowed_origins, is_active, created_at'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/lead-forms/:id (Story 8.2 — AC 8.2.1).
 * Detalhe de um formulário. RLS restringe ao workspace do JWT; 404 se não existir
 * ou pertencer a outro workspace (a query não retorna linha).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('lead_forms')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}

/**
 * PUT /api/lead-forms/:id (Story 8.2 — AC 8.2.1 / 8.2.3).
 * Atualização parcial. Reaplica a validação LGPD de consent_checkbox vinculado ao email
 * quando `fields` é enviado (422). embed_token e slug são imutáveis via PUT.
 */
export async function PUT(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = updateLeadFormSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 422 }
    )
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'Nenhum campo para atualizar' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('lead_forms')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}

/**
 * DELETE /api/lead-forms/:id (Story 8.2 — AC 8.2.1).
 * SOFT DELETE: marca is_active = false. NUNCA remove fisicamente — preserva o histórico
 * de leads vinculados ao formulário (FK leads.lead_form_id).
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('lead_forms')
    .update({ is_active: false })
    .eq('id', id)
    .select('id, is_active')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, is_active: data.is_active })
}
