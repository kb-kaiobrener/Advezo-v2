import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@advezo/database'
import type { LeadFormEmbedResponse } from '@advezo/types'

type RouteContext = { params: Promise<{ id: string }> }

/** Base do loader do formulário embedável (AC 8.2.4). */
const EMBED_SCRIPT_BASE = 'https://app.advezo.com.br/embed/form.js'

/**
 * GET /api/lead-forms/:id/embed (Story 8.2 — AC 8.2.4).
 * Retorna o snippet <script> pronto para colar, o embed_token e instruções de uso.
 * embed_token só é exposto aqui e na resposta de criação — nunca em logs.
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
    .select('embed_token, name')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  }

  const snippet = `<script src="${EMBED_SCRIPT_BASE}?token=${data.embed_token}"></script>`
  const response: LeadFormEmbedResponse = {
    snippet,
    embed_token: data.embed_token,
    instructions:
      'Cole este snippet no HTML da sua landing page, antes do fechamento da tag </body>. O formulário será renderizado automaticamente no local do script.',
  }

  return NextResponse.json(response)
}
