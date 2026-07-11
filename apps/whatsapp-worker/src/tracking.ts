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
import { encryptToken } from '@advezo/utils'

/**
 * Persiste conteúdo de mensagem de conversa TRACKED — CIFRADO em repouso
 * (AES-256-GCM, TOKEN_ENCRYPTION_KEY — decisão 2 da migration 000024).
 * Sem chave configurada, NÃO grava (nunca texto puro). Fire-and-forget.
 */
export async function storeMessage(
  db: NonNullable<TrackingDeps['db']>,
  workspaceId: string,
  conversationId: string,
  direction: 'in' | 'out',
  text: string,
  log: NonNullable<TrackingDeps['log']>
): Promise<void> {
  try {
    const key = process.env.TOKEN_ENCRYPTION_KEY
    if (!key || !text) { if (!key) log('sem TOKEN_ENCRYPTION_KEY — mensagem NÃO armazenada'); return }
    await db.from('conversation_messages').insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction,
      content_encrypted: encryptToken(text, key),
    })
  } catch (e) {
    log('falha ao armazenar mensagem', { error: (e as Error).message })
  }
}

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

/**
 * Ingestão na fila de classificação — Story 5.2 (fire-and-forget).
 * Re-ingestão inteligente (AC 5.2.2): fila pending/processing → refresh de
 * created_at; classificação done há <1h → reusa a linha (volta a pending,
 * retry_count=0); caso contrário INSERT novo com retry_count=0 (AC 5.2.5).
 */
export async function enqueueClassification(
  db: NonNullable<TrackingDeps['db']>,
  workspaceId: string,
  conversationId: string,
  log: NonNullable<TrackingDeps['log']>
): Promise<void> {
  try {
    const { data: last } = await db
      .from('conversation_classification_queue')
      .select('id, status, processed_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    const oneHourAgo = Date.now() - 3600_000
    if (last && (last.status === 'pending' || last.status === 'processing')) {
      await db.from('conversation_classification_queue')
        .update({ created_at: new Date().toISOString() }).eq('id', last.id)
      log('fila: refresh de item existente', { id: last.id })
      return
    }
    if (last && last.status === 'done' && last.processed_at &&
        new Date(last.processed_at).getTime() > oneHourAgo) {
      await db.from('conversation_classification_queue')
        .update({ status: 'pending', retry_count: 0, error: null, created_at: new Date().toISOString() })
        .eq('id', last.id)
      log('fila: reingestão (<1h) na mesma linha', { id: last.id })
      return
    }
    await db.from('conversation_classification_queue')
      .insert({ workspace_id: workspaceId, conversation_id: conversationId, retry_count: 0 })
    log('fila: novo item pending')
  } catch (e) {
    log('fila: falha na ingestão (não impacta atendimento)', { error: (e as Error).message })
  }
}

export async function processIncomingMessage(
  params: { workspaceId: string; accountId: string; remoteJid: string; messageText?: string },
  deps: TrackingDeps = {}
): Promise<void> {
  const { workspaceId, accountId, remoteJid, messageText } = params
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
      .from('tracked_conversations').select('id, status')
      .eq('workspace_id', workspaceId).eq('client_id', conn.client_id)
      .eq('phone_number_hash', phoneHash).limit(1).maybeSingle()
    if (existing) {
      // Story 5.2: mensagem nova de conversa TRACKED → enfileira p/ classificação
      // (AC 5.2.3: untracked são ignoradas pela fila)
      if (existing.status === 'tracked') {
        if (messageText) await storeMessage(db, workspaceId, existing.id, 'in', messageText, log)
        await enqueueClassification(db, workspaceId, existing.id, log)
      }
      else log('conversa untracked — fila ignorada')
      return
    }

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
    const { data: inserted, error: insErr } = await db.from('tracked_conversations').insert({
      workspace_id: workspaceId,
      client_id: conn.client_id,
      link_id: click?.link_id ?? null,
      click_id: click?.id ?? null,
      phone_number_hash: phoneHash,
      first_message_at: now,
      origin_confirmed_at: click ? now : null,
      status: click ? 'tracked' : 'untracked',   // AC 4.4.4: nunca ignorada
    }).select('id').maybeSingle()
    if (insErr) { log('erro ao inserir conversa', { error: insErr.message }); return }

    // Story 5.2: conversa recém-TRACKED entra na fila + 1ª mensagem armazenada
    if (click && inserted) {
      if (messageText) await storeMessage(db, workspaceId, inserted.id, 'in', messageText, log)
      await enqueueClassification(db, workspaceId, inserted.id, log)
    }

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
