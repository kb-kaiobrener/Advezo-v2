---
name: whatsapp-worker-schema
description: Story 3.1 — whatsapp_accounts schema + padrões do worker Baileys (Storage session, circuit breaker, service-role client via subpath)
metadata:
  type: project
---

Schema e padrões autoritativos da Story 3.1 (Epic 3, worker WhatsApp Baileys em `apps/whatsapp-worker`):

**Tabela `whatsapp_accounts` (migration 20260101000010):** `account_id` = E.164 text SEM CHECK de formato (JID Baileys não persistido); `status` CHECK in (disconnected/connecting/connected/cb_paused); `cb_failure_count` int + `cb_paused_at` timestamptz (NULL=fechado); trigger `set_updated_at()`; RLS `workspace_id = auth_workspace_id()`. UNIQUE (workspace_id, account_id).

**Divergência conhecida:** `architecture.md` descreve schema diferente (status CHECK, sem account_id, bucket distinto). A STORY é autoritativa (Article III). Pendente reconciliação por @architect.

**Padrões do worker:**
- Consumir `createSupabaseServiceClient()` via subpath `@advezo/database/service` (NÃO a raiz `@advezo/database` — esta puxa `@supabase/ssr` + `next`, que workers Node puros não têm).
- Sessão Baileys persistida no Supabase Storage bucket privado `wpp`, path `{ws}/wpp/{acc}/session.json`, como bundle base64 do dir useMultiFileAuthState.
- Circuit breaker: janela deslizante em memória (banco é espelho p/ UI, não fonte de verdade da contagem); DI de `updateAccount`+`now` p/ testes. loggedOut(401)=não reconecta; restartRequired(515)=reconecta sem contar falha; outros=transitória conta no breaker.

Ver [[pnpm-exotic-subdeps]]. ESLint não existe no monorepo (lint script é boilerplate scaffold que falha — gate estático real é `tsc --noEmit`).
