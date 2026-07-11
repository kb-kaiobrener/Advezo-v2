import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@advezo/database'

export const dynamic = 'force-dynamic'

/**
 * Retenção LGPD (AC 5.3.9) — apaga conteúdo bruto de mensagens com mais de
 * 90 dias. Diário via Vercel Cron; mesmo padrão de guard dos crons 3.5/3.6.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('Authorization')
  // fail-closed (padrão Epic 2 — OBS-001 do gate 3.6 aplicada aqui)
  if (!cronSecret || !provided || provided !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString()
  const { error, count } = await supabase
    .from('conversation_messages')
    .delete({ count: 'exact' })
    .lt('message_at', cutoff)

  if (error) return NextResponse.json({ error: 'Erro na limpeza' }, { status: 500 })
  return NextResponse.json({ deleted: count ?? 0, cutoff })
}
