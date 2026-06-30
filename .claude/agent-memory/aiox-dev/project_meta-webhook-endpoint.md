---
name: meta-webhook-endpoint
description: Story 8.5 patterns for Meta server-to-server webhooks — raw-body HMAC, timingSafeEqual length-guard, CORS closed, queue dedup idempotent
metadata:
  type: project
---

Story 8.5 implementou o webhook Meta Lead Ads (`apps/web/src/app/api/webhooks/meta/leadgen/route.ts`) — GET (challenge verify) + POST (recebimento de leads).

**Why:** Webhook server-to-server (Meta → Advezo), não endpoint para browser. Autenticação é assinatura HMAC, não embed_token nem JWT.

**How to apply (decisões reusáveis para outros webhooks server-to-server):**

1. **Raw body antes de qualquer parse.** `const rawBody = await request.text()` é a PRIMEIRA operação. O HMAC precisa dos bytes exatos que a Meta assinou; `request.json()` re-serializaria e quebraria toda assinatura. Parse (`JSON.parse(rawBody)`) só DEPOIS da assinatura passar.

2. **`timingSafeEqual` com guarda de length.** `timingSafeEqual` LANÇA em buffers de tamanhos diferentes — checar `sigBuffer.length !== expBuffer.length` ANTES e retornar 403 (não deixar a exceção vazar). Nunca usar `===` (vaza timing byte a byte). Formato do header: `sha256=<hex>`.

3. **Fail closed em secret ausente.** `META_APP_SECRET` não configurado → 500, nunca bypass. Secret nunca em log nem response.

4. **CORS FECHADO.** Diferente do `leads/submit` (Story 8.3, CORS aberto — ver [[leads-public-endpoint]]). Webhook não é chamado por browser: nenhum header `Access-Control-Allow-*`, nenhum handler `OPTIONS`.

5. **Dedup idempotente = ACK 200.** Índice `lead_queue_meta_lead_id_unique` é sobre `meta_lead_id` apenas (global, não composto com workspace). 23505 no INSERT → silencioso, loop nunca retorna cedo, sempre 200. Meta reentrega o mesmo evento; 200 faz parar a reentrega.

6. **Mapeamento ad_account.** `ad_account_id` do payload Meta é EXTERNO → mapear para `id` interno (uuid) + `workspace_id` via `ad_accounts.external_account_id` (coluna confirmada migration 000004). Conta não mapeada → ignorar silenciosamente, não bloqueia ACK.

7. **Service-role obrigatório** (`createSupabaseServiceClient`, `@advezo/database`) — sem JWT, RLS bloquearia tudo. Escopar escrita por `workspace_id` derivado do ad_account.

8. **Teste de HMAC sem mockar crypto.** No test, assinar os bodies com o MESMO `createHmac` do handler (só `@advezo/database` é mockado via `vi.doMock`). Prova validação real: tampered body → 403, wrong secret → 403, válida → 200.

**Pendência conhecida:** geração do `meta_leadgen_verify_token` (`crypto.randomBytes(16).toString('hex')` + exibição única) fica na UI de settings de integrações — out of scope da 8.5.
