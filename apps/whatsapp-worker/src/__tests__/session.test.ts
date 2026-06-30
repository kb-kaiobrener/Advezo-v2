import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks declarados via vi.hoisted() para ficarem disponíveis nas factories
// hoisted de vi.mock (que rodam antes das declarações de módulo).
const { fsMock, storageMock, supabaseMock } = vi.hoisted(() => {
  const fsMock = {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
  const storageMock = {
    upload: vi.fn(),
    download: vi.fn(),
    createBucket: vi.fn(),
  }
  const supabaseMock = {
    storage: {
      from: vi.fn(() => storageMock),
      createBucket: (...args: unknown[]) => storageMock.createBucket(...args),
    },
  }
  return { fsMock, storageMock, supabaseMock }
})

// ── Mock do filesystem (node:fs promises) ────────────────────────────────────
vi.mock('node:fs', () => ({ promises: fsMock }))

// ── Mock do Supabase Storage via service client ──────────────────────────────
vi.mock('@advezo/database/service', () => ({
  createSupabaseServiceClient: () => supabaseMock,
}))

import {
  saveSession,
  restoreSession,
  ensureBucket,
  sessionStoragePath,
  SESSION_BUCKET,
} from '../session.js'

const WS = 'ws-1'
const ACC = '5511999998888'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sessionStoragePath', () => {
  it('monta o caminho {workspace_id}/wpp/{account_id}/session.json (AC 3.1.3)', () => {
    expect(sessionStoragePath(WS, ACC)).toBe('ws-1/wpp/5511999998888/session.json')
  })
})

describe('saveSession', () => {
  it('serializa os arquivos de auth como bundle base64 e faz upload com upsert', async () => {
    fsMock.readdir.mockResolvedValue(['creds.json', 'app-state.json'])
    fsMock.readFile.mockImplementation(async (p: string) =>
      Buffer.from(p.includes('creds') ? 'CREDS' : 'STATE'),
    )
    storageMock.upload.mockResolvedValue({ error: null })

    await saveSession(WS, ACC)

    expect(supabaseMock.storage.from).toHaveBeenCalledWith(SESSION_BUCKET)
    const [path, body, opts] = storageMock.upload.mock.calls[0]
    expect(path).toBe(sessionStoragePath(WS, ACC))
    expect(opts).toMatchObject({ upsert: true, contentType: 'application/json' })

    const bundle = JSON.parse(body as string)
    expect(Buffer.from(bundle['creds.json'], 'base64').toString()).toBe('CREDS')
    expect(Buffer.from(bundle['app-state.json'], 'base64').toString()).toBe('STATE')
  })

  it('não faz upload quando o diretório de sessão ainda não existe', async () => {
    fsMock.readdir.mockRejectedValue(new Error('ENOENT'))
    await saveSession(WS, ACC)
    expect(storageMock.upload).not.toHaveBeenCalled()
  })

  it('propaga erro de upload do Storage', async () => {
    fsMock.readdir.mockResolvedValue(['creds.json'])
    fsMock.readFile.mockResolvedValue(Buffer.from('x'))
    storageMock.upload.mockResolvedValue({ error: { message: 'boom' } })
    await expect(saveSession(WS, ACC)).rejects.toThrow(/boom/)
  })
})

describe('restoreSession', () => {
  it('baixa o bundle e materializa os arquivos no diretório local (sem novo QR)', async () => {
    const bundle = {
      'creds.json': Buffer.from('CREDS').toString('base64'),
      'app-state.json': Buffer.from('STATE').toString('base64'),
    }
    storageMock.download.mockResolvedValue({
      data: { text: async () => JSON.stringify(bundle) },
      error: null,
    })
    fsMock.mkdir.mockResolvedValue(undefined)
    fsMock.writeFile.mockResolvedValue(undefined)

    const restored = await restoreSession(WS, ACC)

    expect(restored).toBe(true)
    expect(fsMock.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(fsMock.writeFile).toHaveBeenCalledTimes(2)
    const written = fsMock.writeFile.mock.calls.map((c) => (c[1] as Buffer).toString())
    expect(written).toContain('CREDS')
    expect(written).toContain('STATE')
  })

  it('retorna false quando não há sessão no Storage', async () => {
    storageMock.download.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const restored = await restoreSession(WS, ACC)
    expect(restored).toBe(false)
    expect(fsMock.writeFile).not.toHaveBeenCalled()
  })

  it('retorna false quando o bundle está corrompido (JSON inválido)', async () => {
    storageMock.download.mockResolvedValue({
      data: { text: async () => 'not-json{' },
      error: null,
    })
    const restored = await restoreSession(WS, ACC)
    expect(restored).toBe(false)
  })
})

describe('ensureBucket', () => {
  it('cria o bucket privado wpp', async () => {
    storageMock.createBucket.mockResolvedValue({ error: null })
    await ensureBucket()
    expect(storageMock.createBucket).toHaveBeenCalledWith(SESSION_BUCKET, { public: false })
  })

  it('é idempotente — ignora erro de bucket já existente', async () => {
    storageMock.createBucket.mockResolvedValue({ error: { message: 'Bucket already exists' } })
    await expect(ensureBucket()).resolves.toBeUndefined()
  })

  it('propaga outros erros de criação de bucket', async () => {
    storageMock.createBucket.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(ensureBucket()).rejects.toThrow(/permission denied/)
  })
})
