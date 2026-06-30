---
name: leads-public-endpoint
description: Epic 8 public lead-submit endpoint — service-role client, workspace_id-as-salt, field_data._ip rate limit, conditional crypto gates
metadata:
  type: project
---

Story 8.3 implementou `POST /api/leads/submit` (`apps/web/src/app/api/leads/submit/route.ts`), o endpoint público de submissão de landing page do Epic 8.

**Why:** Endpoint embed em domínio de terceiros — sem JWT, sem cookie. Autenticação é só o `embed_token` no body. LGPD exige rejeição ativa de email sem consent.

**How to apply (decisões reusáveis para outras stories do Epic 8 e endpoints públicos):**

1. **Service-role obrigatório em endpoints públicos.** Sem JWT, `auth_workspace_id()` é NULL e RLS bloqueia tudo. Use `createSupabaseServiceClient()` (`@advezo/database`) e filtre TODA query por `workspace_id` explicitamente. Mesmo padrão dos crons (ARCH-1, ver [[cron-service-role-gap]]).

2. **Não há coluna `salt`** em `workspaces` nem `workspace_settings` (verificado em todas as migrations). `phone_hash` usa `workspace_id` como salt do HMAC-SHA256 (`createHmac('sha256', workspace_id)`). Decisão autorizada pela story 8.3.

3. **`leads` não tem coluna `ip_address`.** Rate limit por IP é feito gravando o IP em `field_data._ip` (chave interna) e contando via filtro `.eq('field_data->>_ip', ip)`. IP vem de `x-forwarded-for` / `x-real-ip`.

4. **Crypto condicional ao consent:** `email_encrypted = encryptToken(email, TOKEN_ENCRYPTION_KEY)` (AES-256-GCM de `@advezo/utils`) e `consent_given_at = now()` SÓ quando `consent === true`. Gate de consent (422) roda ANTES de qualquer processamento. `SHA256(email)` para CAPI é em memória, nunca coluna.

5. **CAPI stub:** `apps/web/src/lib/capi/lead.ts` (`sendLeadCapi`, `buildLeadCapiUserData`) é stub até Story 8.7 — só monta o `user_data` (em SÓ com consent). Disparo fire-and-forget.

6. Zod v4 quirks (record com 2 args etc.) já cobertos em [[zod-v4-api]].
