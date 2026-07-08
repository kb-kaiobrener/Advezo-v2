'use client'

import { useState } from 'react'
import {
  createTrackingLink,
  toggleTrackingLink,
  updateTrackingLink,
  type TrackingLink,
  type TrackingSourceType,
} from '@/app/actions/tracking-links'

interface ClientOption { id: string; name: string }
interface LinkWithClicks extends TrackingLink { click_count: number; client_name: string }
interface Props { clients: ClientOption[]; links: LinkWithClicks[]; baseUrl: string }

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const SOURCE_LABEL: Record<TrackingSourceType, string> = {
  meta_ad: 'Meta Ads', google_ad: 'Google Ads', custom: 'Custom',
}

async function downloadQr(url: string, code: string) {
  const QRCode = (await import('qrcode')).default
  const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `qr-${code}.png`
  a.click()
}

export function TrackingLinksManager({ clients, links, baseUrl }: Props) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [sourceType, setSourceType] = useState<TrackingSourceType>('custom')
  const [label, setLabel] = useState('')
  const [destination, setDestination] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setPending(true)
    const result = await createTrackingLink({
      client_id: clientId,
      source_type: sourceType,
      source_meta: label ? { label } : {},
      destination_whatsapp: destination,
      code: customCode || undefined,
    })
    setPending(false)
    if ('error' in result && result.error) setMessage({ type: 'error', text: result.error })
    else {
      setMessage({ type: 'success', text: `Link criado: ${baseUrl}/t/${result.code}` })
      setLabel(''); setDestination(''); setCustomCode('')
    }
  }

  async function handleToggle(link: LinkWithClicks) {
    setBusyId(link.id)
    await toggleTrackingLink(link.id, !link.active)
    setBusyId(null)
  }

  // AC 4.2.7: só label e destino editáveis — code imutável (links distribuídos)
  async function handleEdit(link: LinkWithClicks) {
    const label = window.prompt('Label da origem:', link.source_meta?.label ?? '')
    if (label === null) return
    const dest = window.prompt('WhatsApp de destino (E.164):', link.destination_whatsapp)
    if (dest === null) return
    setBusyId(link.id)
    const result = await updateTrackingLink(link.id, {
      source_meta: label ? { ...link.source_meta, label } : link.source_meta,
      destination_whatsapp: dest,
    })
    setBusyId(null)
    if ('error' in result && result.error) setMessage({ type: 'error', text: result.error })
  }

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(`${baseUrl}/t/${code}`)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Novo link rastreável</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="tl_client">Cliente</label>
            <select id="tl_client" value={clientId} onChange={e => setClientId(e.target.value)} className={inputClass} required>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="tl_source">Fonte de origem</label>
            <select id="tl_source" value={sourceType} onChange={e => setSourceType(e.target.value as TrackingSourceType)} className={inputClass}>
              <option value="custom">Custom (label livre)</option>
              <option value="meta_ad">Meta Ads</option>
              <option value="google_ad">Google Ads</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="tl_label">
              {sourceType === 'custom' ? 'Label da origem' : 'Campanha / conjunto / anúncio'}
            </label>
            <input id="tl_label" value={label} onChange={e => setLabel(e.target.value)}
              placeholder={sourceType === 'custom' ? 'Ex: bio-instagram' : 'Ex: campanha-verao / cj-01 / ad-03'}
              className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="tl_dest">WhatsApp de destino</label>
            <input id="tl_dest" value={destination} onChange={e => setDestination(e.target.value)}
              placeholder="Ex: 5511999998888" className={inputClass} required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="tl_code">Código (opcional — gerado se vazio)</label>
            <input id="tl_code" value={customCode} onChange={e => setCustomCode(e.target.value)}
              placeholder="Ex: promo-julho" className={inputClass} />
          </div>
        </div>
        {message && (
          <p className={message.type === 'success' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>
            {message.text}
          </p>
        )}
        <button type="submit" disabled={pending || !clientId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {pending ? 'Criando...' : 'Criar link'}
        </button>
      </form>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum link rastreável ainda — crie o primeiro acima.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {links.map(link => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  /t/{link.code}
                  <span className="ml-2 text-xs text-muted-foreground">{link.client_name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_LABEL[link.source_type]}
                  {link.source_meta?.label ? ` · ${link.source_meta.label}` : ''} · {link.click_count} cliques
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${link.active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {link.active ? 'Ativo' : 'Inativo'}
                </span>
                <button type="button" onClick={() => handleCopy(link.code)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
                  {copied === link.code ? 'Copiado!' : 'Copiar URL'}
                </button>
                <button type="button" onClick={() => downloadQr(`${baseUrl}/t/${link.code}`, link.code)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
                  QR PNG
                </button>
                <button type="button" disabled={busyId === link.id} onClick={() => handleEdit(link)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50">
                  Editar
                </button>
                <button type="button" disabled={busyId === link.id} onClick={() => handleToggle(link)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50">
                  {link.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
