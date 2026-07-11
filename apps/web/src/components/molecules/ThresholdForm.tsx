'use client'

import { useState } from 'react'
import { saveClassificationThreshold } from '@/app/actions/classification-settings'

/** Story 5.6 — limiar de confiança (0.5–1.0, padrão 0.7). */
export function ThresholdForm({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null); setSaving(true)
    const r = await saveClassificationThreshold(value)
    setSaving(false)
    setMsg('error' in r && r.error ? { ok: false, text: r.error } : { ok: true, text: 'Limiar salvo — vale para classificações futuras.' })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <label htmlFor="threshold" className="text-sm font-medium text-foreground">
          Limiar de confiança para revisão manual
        </label>
        <input
          id="threshold" type="number" min={0.5} max={1} step={0.05} value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Classificações abaixo deste valor vão para revisão manual e NUNCA disparam
          conversões automáticas ao Meta Ads (NFR-6). Mínimo permitido: 0.5 — valores
          baixos aumentam o risco de falsos positivos enviados ao algoritmo.
        </p>
        {value < 0.7 && (
          <p className="text-xs text-amber-600">
            ⚠️ Abaixo do padrão (0.7): mais classificações passam sem revisão humana.
          </p>
        )}
      </div>
      {msg && <p className={msg.ok ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>{msg.text}</p>}
      <button type="submit" disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
      <p className="text-xs text-muted-foreground">
        A alteração vale apenas para classificações futuras — nada é reclassificado retroativamente.
      </p>
    </form>
  )
}
