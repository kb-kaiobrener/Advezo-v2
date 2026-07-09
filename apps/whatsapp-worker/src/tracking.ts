// tracking.ts — Captura de origem na 1ª mensagem (Epic 4, Story 4.4)
//
// Fluxo (ACs 4.4.1–4.4.7):
//   mensagem de número novo → HMAC-SHA256(E.164, workspace+GLOBAL_HMAC_SECRET)
//   → já existe tracked_conversation? sai (não é 1ª mensagem)
//   → clique não-casado nos últimos TRACKING_WINDOW_DAYS (padrão 7) nos links
//     do workspace? LIFO GLOBAL: o clique MAIS RECENTE entre TODOS os links,
//     independente de qual link (AC 4.4.3) → tracked + phone_matched=true no
//     clique + AVISO AO TITULAR via notice_template da conexão (NFR-8/AC 4.4.6)
//   → sem clique: untracked (nunca ignorada — AC 4.4.4)
//
// LGPD: número NUNCA persistido em claro — só phone_number_hash (pseudonimizado).
// Assíncrono: chamado com void a partir do messages.upsert (AC 4.4.5).

import { createHmac } from 'node:crypto'
import { createSupabaseServiceClient } from '@advezo/database/service'

const WINDOW_DAYS = () => Number(process.env.TRACKING_WINDOW_DAYS ?? 7)
const DEBUG = () => process.env.TRACKING_DEBUG === 'true'

export function hashPhone(phoneE164: string, workspaceId: string, secret: string): string {
  return createHmac('sha256', workspaceId + secret).update(phoneE164).digest('hex')
}

export interface TrackingDeps {
  db?: ReturnType<typeof createSupabaseServiceClient>
  sendText?: (jid: string, text: string) => Promise<void>
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export async function processIncomingMessage(
  params: { workspaceId: string; accountId: string; remoteJid: string },
  deps: TrackingDeps = {}
): Promise<void> {
  const { workspaceId, accountId, remoteJid } = params
  const log = deps.log ?? ((m: string, e?: Record<string, unknown>) => { if (DEBUG()) console.log('[tracking]', m, e ?? '') })
  try {
    // só conversas individuais — grupos/status não são leads
    if (!remoteJid.endsWith('@s.whatsapp.net')) return
    const phone = remoteJid.split('@')[0].replace(/\D/g, '')
    if (!/^\d{10,15}$/.test(phone)) return

    const secret = process.env.GLOBAL_HMAC_SECRET
    if (!secret) { log('sem GLOBAL_HMAC_SECRET — matching pulado'); return }  // coerente com 4.3

    const db = deps.db ?? createSupabaseServiceClient()

    // client_id da conta (whatsapp_connections) — sem vínculo, sem atribuição
    const { data: conn } = await db
      .from('whatsapp_connections')
      .select('client_id, notice_template')
      .eq('workspace_id', workspaceId).eq('account_id', accountId)
      .limit(1).maybeSingle()
    if (!conn) { log('conta sem whatsapp_connection — pulado', { accountId }); return }

    const phoneHash = hashPhone(phone, workspaceId, secret)

    // 1ª mensagem? (UNIQUE workspace+client+hash)
    const { data: existing } = await db
      .from('tracked_conversations').select('id')
      .eq('workspace_id', workspaceId).eq('client_id', conn.client_id)
      .eq('phone_number_hash', phoneHash).limit(1).maybeSingle()
    if (existing) { log('conversa já registrada', { id: existing.id }); return }

    // LIFO GLOBAL (AC 4.4.3): clique não-casado mais recente entre TODOS os
    // links do workspace na janela — independente do link de origem.
    const since = new Date(Date.now() - WINDOW_DAYS() * 86400_000).toISOString()
    const { data: links } = await db
      .from('tracking_links').select('id')
      .eq('workspace_id', workspaceId).eq('client_id', conn.client_id)
    const linkIds = (links ?? []).map((l: { id: string }) => l.id)

    let click: { id: string; link_id: string } | null = null
    if (linkIds.length) {
      const { data } = await db
        .from('tracked_clicks').select('id, link_id')
        .in('link_id', linkIds).eq('phone_matched', false).gte('clicked_at', since)
        .order('clicked_at', { ascending: false }).limit(1).maybeSingle()
      click = data ?? null
    }

    const now = new Date().toISOString()
    const { error: insErr } = await db.from('tracked_conversations').insert({
      workspace_id: workspaceId,
      client_id: conn.client_id,
      link_id: click?.link_id ?? null,
      click_id: click?.id ?? null,
      phone_number_hash: phoneHash,
      first_message_at: now,
      origin_confirmed_at: click ? now : null,
      status: click ? 'tracked' : 'untracked',   // AC 4.4.4: nunca ignorada
    })
    if (insErr) { log('erro ao inserir conversa', { error: insErr.message }); return }

    if (click) {
      await db.from('tracked_clicks').update({ phone_matched: true }).eq('id', click.id)
      log('conversa TRACKED', { click: click.id, link: click.link_id })

      // AVISO AO TITULAR (NFR-8 / AC 4.4.6) — template da Story 3.2
      if (conn.notice_template && deps.sendText) {
        try {
          await deps.sendText(remoteJid, conn.notice_template)
          log('aviso ao titular enviado')
        } catch (e) {
          log('falha no aviso ao titular', { error: (e as Error).message })
        }
      } else if (!conn.notice_template) {
        log('sem notice_template configurado — aviso não enviado (pendência NFR-8)')
      }
    } else {
      log('conversa UNTRACKED (sem clique na janela)')
    }
  } catch (e) {
    log('erro no matching', { error: (e as Error).message })  // nunca propaga (AC 4.4.5)
  }
}
