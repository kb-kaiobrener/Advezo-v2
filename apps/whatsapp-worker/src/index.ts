// src/index.ts — WhatsApp Worker (Baileys)
//
// Substitui a integração baseada em Chromium/Puppeteer por @whiskeysockets/baileys
// (AC 3.1.1 / 3.1.9). Expõe um servidor Express com:
//   - GET /health  → 200 { status: 'ok', uptime } (AC 3.1.8)
//   - GET /qr      → 200 { qr: '<base64 PNG>' }    (AC 3.1.2)
//
// Conexão Baileys com:
//   - sessão persistida no Supabase Storage (AC 3.1.3, ver session.ts)
//   - reconexão automática com backoff exponencial (AC 3.1.6)
//   - circuit breaker após 5 falhas em 10 min (AC 3.1.7, ver circuit-breaker.ts)

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys'
import express, { type Request, type Response } from 'express'
import pino from 'pino'
import QRCode from 'qrcode'
import { createSupabaseServiceClient } from '@advezo/database/service'
import { CircuitBreaker } from './circuit-breaker.js'
import { processIncomingMessage } from './tracking.js'
import {
  ensureBucket,
  restoreSession,
  saveSession,
  sessionLocalDir,
} from './session.js'

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
})

const PORT = Number(process.env.PORT) || 3000

// ── Estado em memória por conta ──────────────────────────────────────────────
const accountKey = (workspaceId: string, accountId: string) => `${workspaceId}:${accountId}`

/** QR codes (base64 PNG data URL) pendentes de escaneamento, por conta. */
const qrCache = new Map<string, string>()
/** Sockets ativos por conta, para evitar conexões duplicadas. */
const sockets = new Map<string, WASocket>()
/** Keys com connect() em andamento — guard contra race condition em /qr. */
const connectingKeys = new Set<string>()
/** Circuit breakers por conta. */
const breakers = new Map<string, CircuitBreaker>()

function getBreaker(workspaceId: string, accountId: string): CircuitBreaker {
  const key = accountKey(workspaceId, accountId)
  let cb = breakers.get(key)
  if (!cb) {
    cb = new CircuitBreaker()
    breakers.set(key, cb)
  }
  return cb
}

/** Extrai o statusCode de desconexão da forma do erro Boom, sem importar @hapi/boom. */
function disconnectStatusCode(error: unknown): number | undefined {
  const out = (error as { output?: { statusCode?: number } } | undefined)?.output
  return out?.statusCode
}

/** Marca a conta como desconectada nas duas tabelas (worker + client-facing). */
async function markDisconnected(workspaceId: string, accountId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await Promise.all([
    supabase
      .from('whatsapp_accounts')
      .update({ status: 'disconnected' })
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId),
    supabase
      .from('whatsapp_connections')
      .update({ status: 'disconnected', connected_at: null })
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId),
  ])
}

/** Marca a conta como conectada nas duas tabelas (worker + client-facing). */
async function markConnected(workspaceId: string, accountId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await Promise.all([
    supabase
      .from('whatsapp_accounts')
      .update({ status: 'connected' })
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId),
    supabase
      .from('whatsapp_connections')
      .update({ status: 'connected', connected_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId),
  ])
}

// ── Conexão Baileys ──────────────────────────────────────────────────────────
async function connect(workspaceId: string, accountId: string): Promise<void> {
  const key = accountKey(workspaceId, accountId)
  const breaker = getBreaker(workspaceId, accountId)

  // Marca como em andamento ANTES do primeiro await — guard síncrono contra race condition.
  connectingKeys.add(key)

  try {
    // Restaura sessão do Storage (AC 3.1.3) antes de abrir o socket.
    await restoreSession(workspaceId, accountId)
    const { state, saveCreds } = await useMultiFileAuthState(sessionLocalDir(workspaceId, accountId))

    const { version } = await fetchLatestBaileysVersion()
    logger.info({ version }, 'usando versão WA Web')
    const sock = makeWASocket({ auth: state, logger, version })
    sockets.set(key, sock)
    connectingKeys.delete(key) // socket registrado — guard liberado

  // Persiste credenciais no Storage a cada atualização (upload contínuo).
  sock.ev.on('creds.update', async () => {
    await saveCreds()
    try {
      await saveSession(workspaceId, accountId)
    } catch (err) {
      logger.error({ err, accountId }, 'falha ao salvar sessão no Storage')
    }
  })

  // Rastreamento de origem (Story 4.4): matching ASSÍNCRONO via void — nunca
  // bloqueia o recebimento (AC 4.4.5). Só mensagens RECEBIDAS (não fromMe).
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      const jid = msg.key?.remoteJid
      if (!jid || msg.key?.fromMe) continue
      const messageText =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? undefined
      void processIncomingMessage(
        { workspaceId, accountId, remoteJid: jid, messageText },
        { sendText: async (to, text) => { await sock.sendMessage(to, { text }) } }
      )
    }
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrCache.set(key, await QRCode.toDataURL(qr))
      logger.info({ accountId }, 'novo QR code gerado')
    }

    if (connection === 'open') {
      qrCache.delete(key)
      try {
        await breaker.recordSuccess(workspaceId, accountId)
      } catch (err) {
        logger.error({ err, accountId }, 'falha ao registrar sucesso no circuit breaker')
      }
      try {
        await markConnected(workspaceId, accountId)
      } catch (err) {
        logger.error({ err, accountId }, 'falha ao marcar conta como conectada no banco')
      }
      logger.info({ accountId }, 'whatsapp conectado')
    }

    if (connection === 'close') {
      const statusCode = disconnectStatusCode(lastDisconnect?.error)

      // restartRequired (515): parte normal do handshake — reconecta sem contar falha.
      if (statusCode === DisconnectReason.restartRequired) {
        logger.info({ accountId }, 'restart exigido pelo Baileys — recriando socket')
        void connect(workspaceId, accountId)
        return
      }

      // loggedOut (401): logout manual — não reconectar (evita loop de QR).
      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn({ accountId }, 'logout detectado — não reconectando')
        qrCache.delete(key)
        sockets.delete(key)
        try {
          await markDisconnected(workspaceId, accountId)
        } catch (err) {
          logger.error({ err, accountId }, 'falha ao marcar conta como desconectada no banco')
        }
        return
      }

      // Queda transitória: registra no circuit breaker.
      let paused = false
      let failureCount = 1
      try {
        ;({ paused, failureCount } = await breaker.recordFailure(workspaceId, accountId))
      } catch (err) {
        logger.error({ err, accountId }, 'falha ao registrar falha no circuit breaker — reconectando com delay padrão')
      }
      if (paused) {
        logger.error({ accountId, failureCount }, 'circuit breaker ABERTO — parando reconexão')
        sockets.delete(key)
        return
      }

      const delayMs = Math.min(2 ** failureCount * 1000, 60_000)
      logger.warn({ accountId, failureCount, delayMs }, 'queda transitória — reconectando')
      setTimeout(() => void connect(workspaceId, accountId), delayMs)
    }
  })
  } catch (err) {
    connectingKeys.delete(key)
    throw err
  }
}

// ── Servidor Express ─────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) })
})

app.get('/qr', async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspace_id ?? '')
  const accountId = String(req.query.account_id ?? '')
  if (!workspaceId || !accountId) {
    res.status(400).json({ error: 'workspace_id e account_id são obrigatórios' })
    return
  }

  const key = accountKey(workspaceId, accountId)
  // Inicia conexão só se não há socket ativo E não há connect() em andamento.
  if (!sockets.has(key) && !connectingKeys.has(key)) {
    try {
      await connect(workspaceId, accountId)
    } catch (err) {
      logger.error({ err, accountId }, 'falha ao iniciar conexão para QR')
      res.status(500).json({ error: 'falha ao iniciar conexão' })
      return
    }
  }

  const qr = qrCache.get(key)
  if (!qr) {
    // Conexão iniciada mas QR ainda não emitido (ou já conectado).
    res.status(202).json({ qr: null, status: 'aguardando QR ou já conectado' })
    return
  }
  res.status(200).json({ qr })
})

app.get('/qr-view', (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspace_id ?? '')
  const accountId = String(req.query.account_id ?? '')
  if (!workspaceId || !accountId) {
    res.status(400).send('<p>workspace_id e account_id são obrigatórios</p>')
    return
  }

  const qrEndpoint = `/qr?workspace_id=${encodeURIComponent(workspaceId)}&account_id=${encodeURIComponent(accountId)}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>QR WhatsApp — ${accountId}</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    #status { font-size: 1rem; color: #555; margin-bottom: 1rem; }
    #qr-img { width: 280px; height: 280px; display: none; }
    #connected { font-size: 1.5rem; font-weight: bold; color: #22c55e; display: none; }
  </style>
</head>
<body>
  <p id="status">Aguardando QR code...</p>
  <img id="qr-img" alt="QR Code WhatsApp" />
  <p id="connected">✅ Conectado!</p>
  <script>
    let hadQr = false
    const img = document.getElementById('qr-img')
    const status = document.getElementById('status')
    const connected = document.getElementById('connected')

    async function poll() {
      try {
        const res = await fetch('${qrEndpoint}')
        const data = await res.json()
        if (data.qr) {
          hadQr = true
          img.src = data.qr
          img.style.display = 'block'
          status.textContent = 'Escaneie o QR com o WhatsApp'
          connected.style.display = 'none'
        } else if (hadQr) {
          img.style.display = 'none'
          status.style.display = 'none'
          connected.style.display = 'block'
          return // para o polling
        }
      } catch (_) {
        status.textContent = 'Erro ao buscar QR — tentando novamente...'
      }
      setTimeout(poll, 2000)
    }

    poll()
  </script>
</body>
</html>`)
})

app.post('/send', async (req: Request, res: Response) => {
  const { workspace_id, account_id, to, text } = req.body as {
    workspace_id?: string
    account_id?: string
    to?: string
    text?: string
  }

  if (!workspace_id || !account_id || !to || !text) {
    res.status(400).json({ error: 'workspace_id, account_id, to e text são obrigatórios' })
    return
  }

  const key = accountKey(workspace_id, account_id)
  const sock = sockets.get(key)
  if (!sock) {
    res.status(404).json({ error: 'sem socket ativo para essa conta' })
    return
  }

  try {
    // Grupos chegam como JID completo (ex: 120363XXXX@g.us) — preservar.
    // Números individuais chegam como E.164 puro — anexar @s.whatsapp.net.
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`
    await sock.sendMessage(jid, { text })
    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error({ err, account_id, to }, 'falha ao enviar mensagem')
    res.status(500).json({ error: 'falha ao enviar mensagem' })
  }
})

app.get('/status', (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspace_id ?? '')
  const accountId = String(req.query.account_id ?? '')
  if (!workspaceId || !accountId) {
    res.status(400).json({ error: 'workspace_id e account_id são obrigatórios' })
    return
  }

  const key = accountKey(workspaceId, accountId)
  let status: 'disconnected' | 'connecting' | 'connected'
  if (sockets.has(key) && !qrCache.has(key)) {
    status = 'connected'
  } else if (connectingKeys.has(key) || qrCache.has(key)) {
    status = 'connecting'
  } else {
    status = 'disconnected'
  }

  res.status(200).json({ status, qr: qrCache.get(key) ?? null })
})

app.post('/disconnect', async (req: Request, res: Response) => {
  const { workspace_id, account_id } = req.body as {
    workspace_id?: string
    account_id?: string
  }
  if (!workspace_id || !account_id) {
    res.status(400).json({ error: 'workspace_id e account_id são obrigatórios' })
    return
  }

  const key = accountKey(workspace_id, account_id)
  const sock = sockets.get(key)
  qrCache.delete(key)
  sockets.delete(key)
  connectingKeys.delete(key)

  try {
    if (sock) await sock.logout()
  } catch (err) {
    logger.warn({ err, account_id }, 'erro ao desconectar socket (ignorado)')
  }
  try {
    await markDisconnected(workspace_id, account_id)
  } catch (err) {
    logger.error({ err, account_id }, 'falha ao marcar conta como desconectada no banco')
  }

  res.status(200).json({ ok: true })
})

async function main(): Promise<void> {
  await ensureBucket()
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'whatsapp-worker ouvindo')
  })
}

main().catch((err) => {
  logger.fatal({ err }, 'falha fatal no boot do worker')
  process.exit(1)
})
