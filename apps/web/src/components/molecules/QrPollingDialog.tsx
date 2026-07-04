'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { confirmWhatsAppConnected, connectWhatsApp } from '@/app/actions/whatsapp'

type PollingState = 'waiting' | 'scanning' | 'connected' | 'timeout' | 'error'

const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 5 * 60 * 1000

interface Props {
  clientId: string
  accountId: string
  workspaceId: string
  onClose: () => void
}

export function QrPollingDialog({ clientId, accountId, workspaceId, onClose }: Props) {
  const [state, setState] = useState<PollingState>('waiting')
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)
    pollRef.current = null
    timerRef.current = null
  }, [])

  const handleConnected = useCallback(async () => {
    stopPolling()
    setState('connected')
    await confirmWhatsAppConnected(clientId, accountId)
    setTimeout(onClose, 1500)
  }, [clientId, accountId, onClose, stopPolling])

  const pollOnce = useCallback(async () => {
    try {
      const statusRes = await fetch(
        `/api/whatsapp/status?workspace_id=${workspaceId}&account_id=${accountId}`
      )
      const statusData = await statusRes.json() as { status?: string }

      if (statusData.status === 'connected') {
        await handleConnected()
        return
      }

      const qrRes = await fetch(
        `/api/whatsapp/qr?workspace_id=${workspaceId}&account_id=${accountId}`
      )
      const qrData = await qrRes.json() as { qr?: string | null }

      if (qrData.qr) {
        setQrSrc(qrData.qr)
        setState('scanning')
      } else if (state !== 'scanning') {
        setState('waiting')
      }
    } catch {
      // network error — keep polling
    }
  }, [workspaceId, accountId, handleConnected, state])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    async function start() {
      const result = await connectWhatsApp(clientId, accountId)
      if ('error' in result && result.error) {
        setErrorMessage(result.error as string)
        setState('error')
        return
      }

      timerRef.current = setTimeout(() => {
        stopPolling()
        setState('timeout')
      }, TIMEOUT_MS)

      await pollOnce()
      pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS)
    }

    void start()

    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) { stopPolling(); onClose() } }}
    >
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
        <button
          onClick={() => { stopPolling(); onClose() }}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fechar"
        >
          ✕
        </button>

        <h2 className="mb-1 text-base font-semibold text-card-foreground">
          Conectar WhatsApp
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          +{accountId}
        </p>

        <div className="flex flex-col items-center gap-4">
          {state === 'waiting' && (
            <>
              <div className="size-12 animate-spin rounded-full border-4 border-border border-t-primary" />
              <p className="text-sm text-muted-foreground">Aguardando QR code...</p>
            </>
          )}

          {state === 'scanning' && qrSrc && (
            <>
              <img
                src={qrSrc}
                alt="QR Code WhatsApp"
                className="size-56 rounded-lg"
              />
              <p className="text-sm text-muted-foreground">
                Abra o WhatsApp e escaneie o código
              </p>
            </>
          )}

          {state === 'connected' && (
            <p className="text-lg font-semibold text-green-600">✅ Conectado!</p>
          )}

          {state === 'timeout' && (
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">QR code expirado.</p>
              <button
                onClick={() => { stopPolling(); onClose() }}
                className="text-sm text-primary hover:underline"
              >
                Fechar e tentar novamente
              </button>
            </div>
          )}

          {state === 'error' && (
            <p className="text-sm text-destructive">{errorMessage ?? 'Erro ao iniciar conexão.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
