import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * Redirect público de link rastreável — Story 4.3 (/t/[code]).
 * Edge runtime: sem cold start, WebCrypto para HMAC (sem node:crypto).
 *
 * Fluxo (ACs 4.3.1–4.3.6):
 *   - busca link por code via Supabase REST (service role, server-side);
 *   - inexistente → 404 com página customizada inline;
 *   - inativo → 302 para /link-indisponivel (nunca 404 genérico);
 *   - ativo → registra clique FIRE-AND-FORGET (não bloqueia o redirect;
 *     falha no log nunca impede o redirect — AC 4.3.4) e 302 → wa.me.
 *
 * LGPD: ip_hash = HMAC-SHA256(ip, workspace_id + GLOBAL_HMAC_SECRET) —
 * pseudonimização (Art. 5º XII), nunca "anônimo".
 */

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function notFoundPage(): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Link não encontrado</title></head>
<body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa">
<div style="text-align:center;max-width:360px;padding:24px">
<h1 style="font-size:20px;margin-bottom:8px">Link não encontrado</h1>
<p style="color:#666;font-size:14px">Este link não existe ou foi digitado incorretamente. Confira o endereço com quem o enviou.</p>
</div></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey || !code) return notFoundPage()

  const res = await fetch(
    `${supabaseUrl}/rest/v1/tracking_links?select=id,workspace_id,destination_whatsapp,active&code=eq.${encodeURIComponent(code.toLowerCase())}&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: 'no-store' }
  )
  const rows = (await res.json().catch(() => [])) as Array<{
    id: string; workspace_id: string; destination_whatsapp: string; active: boolean
  }>
  const link = rows[0]

  if (!link) return notFoundPage()                                     // AC 4.3.6
  if (!link.active) {
    return NextResponse.redirect(new URL('/link-indisponivel', req.url), 302)  // AC 4.3.5
  }

  // ── log do clique — fire-and-forget (AC 4.3.2/4.3.4) ──────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const gclid = req.nextUrl.searchParams.get('gclid')
  const userAgent = req.headers.get('user-agent') ?? null
  const secret = process.env.GLOBAL_HMAC_SECRET ?? ''

  const logClick = async () => {
    try {
      // Sem GLOBAL_HMAC_SECRET, pula o log em vez de hashear com segredo vazio —
      // um ip_hash sem segredo real quebraria silenciosamente o casamento com
      // phone_number_hash da Wave 3 (4.4), calculado com o segredo correto.
      if (!secret) return
      const ipHash = await hmacHex(ip, link.workspace_id + secret)
      await fetch(`${supabaseUrl}/rest/v1/tracked_clicks`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ link_id: link.id, ip_hash: ipHash, user_agent: userAgent, gclid }),
      })
    } catch {
      // nunca impede o redirect (AC 4.3.4)
    }
  }

  // Edge: waitUntil mantém o log vivo após a resposta; fallback: dispara sem await
  const anyCtx = ctx as unknown as { waitUntil?: (p: Promise<unknown>) => void }
  if (typeof anyCtx.waitUntil === 'function') anyCtx.waitUntil(logClick())
  else void logClick()

  return NextResponse.redirect(`https://wa.me/${link.destination_whatsapp}`, 302)  // AC 4.3.3
}
