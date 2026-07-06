'use client'

import { useMemo, useState, useTransition } from 'react'
import { AVAILABLE_METRICS, type MetricKey } from '@/lib/dashboard/metrics'
import {
  saveDashboardConfig,
  deactivateDashboard,
  uploadDashboardLogo,
} from '@/app/actions/dashboard'

export interface DashboardConfig {
  token: string
  logo_url: string | null
  selected_metrics: string[]
  password_hash: string | null
  is_active: boolean
}

interface Props {
  config?: DashboardConfig | null
  clientId: string
}

const DEFAULT_METRICS: MetricKey[] = ['spend', 'impressions', 'clicks']

export function DashboardConfigForm({ config, clientId }: Props) {
  const [selected, setSelected] = useState<MetricKey[]>(
    (config?.selected_metrics as MetricKey[] | undefined)?.length
      ? (config!.selected_metrics as MetricKey[])
      : DEFAULT_METRICS
  )
  const [password, setPassword] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(config?.logo_url ?? null)
  const [token, setToken] = useState<string | null>(config?.token ?? null)
  const [isActive, setIsActive] = useState<boolean>(config?.is_active ?? false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  const hasPassword = Boolean(config?.password_hash)

  const publicLink = useMemo(() => {
    if (!token || typeof window === 'undefined') return null
    return `${window.location.origin}/dashboard/${token}`
  }, [token])

  function toggleMetric(key: MetricKey) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    )
  }

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveDashboardConfig(clientId, {
        selected_metrics: selected,
        // string vazia = não altera existência de senha? Optamos por: vazio = sem senha.
        password: password.length > 0 ? password : null,
      })
      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }
      if ('token' in result && result.token) {
        setToken(result.token)
        setIsActive(true)
        setPassword('')
        setMessage('Link gerado com sucesso.')
      }
    })
  }

  function handleDeactivate() {
    setMessage(null)
    startTransition(async () => {
      const result = await deactivateDashboard(clientId)
      if ('error' in result && result.error) {
        setMessage(result.error)
        return
      }
      setIsActive(false)
      setMessage('Link desativado.')
    })
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setUploading(true)
    const formData = new FormData()
    formData.append('logo', file)
    const result = await uploadDashboardLogo(clientId, formData)
    setUploading(false)
    e.target.value = ''
    if ('error' in result && result.error) {
      setMessage(result.error)
      return
    }
    if ('logoUrl' in result && result.logoUrl) {
      setLogoUrl(result.logoUrl)
      setMessage('Logo atualizado.')
    }
  }

  async function handleCopy() {
    if (!publicLink) return
    await navigator.clipboard.writeText(publicLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-5">
      {/* Métricas */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-card-foreground">Métricas exibidas</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AVAILABLE_METRICS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(m.key)}
                onChange={() => toggleMetric(m.key)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-card-foreground">Logo da agência</label>
        <div className="flex items-center gap-3">
          {logoUrl && (
            // Uso de <img> na UI interna do gestor é aceitável; o <Image> otimizado
            // do Next fica na rota pública (AC 3.7.8).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-10 w-auto rounded border border-border" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoChange}
            disabled={uploading}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-muted/80"
          />
          {uploading && <span className="text-xs text-muted-foreground">Enviando...</span>}
        </div>
        <p className="text-xs text-muted-foreground">PNG ou JPEG, até 2MB.</p>
      </div>

      {/* Senha */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-card-foreground">
          Proteção por senha (opcional)
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasPassword ? 'Senha configurada — digite para alterar' : 'Em branco = dashboard público'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {token ? 'Atualizar link' : 'Gerar link'}
        </button>

        {publicLink && isActive && (
          <button
            onClick={handleCopy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        )}

        {token && isActive && (
          <button
            onClick={handleDeactivate}
            disabled={isPending}
            className="rounded-md px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            Desativar link
          </button>
        )}
      </div>

      {publicLink && isActive && (
        <p className="break-all text-xs text-muted-foreground">
          Link público: <span className="font-mono">{publicLink}</span>
        </p>
      )}

      {token && !isActive && (
        <p className="text-xs text-muted-foreground">
          Link desativado. Clique em &quot;Atualizar link&quot; para reativar (mesmo endereço).
        </p>
      )}

      {message && <p className="text-xs text-foreground">{message}</p>}
    </div>
  )
}
