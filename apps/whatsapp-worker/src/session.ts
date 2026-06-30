// src/session.ts
// Persistência da sessão Baileys no Supabase Storage (AC 3.1.3).
//
// Caminho de armazenamento: {workspace_id}/wpp/{account_id}/session.json
// Bucket: `wpp` (privado, service-role). Ver ensureBucket().
//
// IDS: REUSE de createSupabaseServiceClient() de @advezo/database/service
// (decisão #7 de Checkpoint 0). O subpath /service é livre de acoplamento com
// Next.js — importar a raiz de @advezo/database puxaria @supabase/ssr + next,
// que este worker (processo Node puro em Railway) não possui.
//
// Baileys expõe estado de auth via useMultiFileAuthState (vários arquivos num
// diretório). Para persistir num único objeto no Storage, serializamos o
// conteúdo do diretório como um único JSON ({ filename: base64 }) e restauramos
// de volta para um diretório temporário antes de chamar useMultiFileAuthState.

import { createSupabaseServiceClient } from '@advezo/database/service'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const SESSION_BUCKET = 'wpp'

/** Caminho do objeto de sessão no Storage para uma conta. */
export function sessionStoragePath(workspaceId: string, accountId: string): string {
  return `${workspaceId}/wpp/${accountId}/session.json`
}

/** Diretório temporário local onde Baileys lê/escreve os arquivos de auth. */
export function sessionLocalDir(workspaceId: string, accountId: string): string {
  return path.join(process.cwd(), '.session', workspaceId, accountId)
}

/**
 * Garante que o bucket privado `wpp` exista. Idempotente — ignora o erro de
 * "já existe". Executado uma vez no boot do worker.
 */
export async function ensureBucket(): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.storage.createBucket(SESSION_BUCKET, { public: false })
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Falha ao garantir bucket ${SESSION_BUCKET}: ${error.message}`)
  }
}

/**
 * Serializa o conteúdo do diretório de auth local e faz upload para o Storage
 * como um único session.json. Chamado a cada `creds.update` do Baileys.
 */
export async function saveSession(workspaceId: string, accountId: string): Promise<void> {
  const dir = sessionLocalDir(workspaceId, accountId)
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch {
    return // nada a salvar ainda
  }

  const bundle: Record<string, string> = {}
  for (const file of files) {
    const buf = await fs.readFile(path.join(dir, file))
    bundle[file] = buf.toString('base64')
  }

  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.storage
    .from(SESSION_BUCKET)
    .upload(sessionStoragePath(workspaceId, accountId), JSON.stringify(bundle), {
      upsert: true,
      contentType: 'application/json',
    })
  if (error) {
    throw new Error(`Falha ao salvar sessão (${accountId}): ${error.message}`)
  }
}

/**
 * Baixa o session.json do Storage (se existir) e materializa os arquivos de auth
 * no diretório local, para que useMultiFileAuthState restaure a sessão sem novo
 * QR code após restart (AC 3.1.3). Retorna true se uma sessão foi restaurada.
 */
export async function restoreSession(workspaceId: string, accountId: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.storage
    .from(SESSION_BUCKET)
    .download(sessionStoragePath(workspaceId, accountId))

  if (error || !data) return false

  let bundle: Record<string, string>
  try {
    bundle = JSON.parse(await data.text()) as Record<string, string>
  } catch {
    return false // sessão corrompida — força novo QR
  }

  const dir = sessionLocalDir(workspaceId, accountId)
  await fs.mkdir(dir, { recursive: true })
  for (const [file, b64] of Object.entries(bundle)) {
    await fs.writeFile(path.join(dir, file), Buffer.from(b64, 'base64'))
  }
  return true
}
