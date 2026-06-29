---
name: ad-accounts-schema
description: ad_accounts table authoritative schema came from Story 2.1; Epic 1 had a divergent scaffold that was reconciled
metadata:
  type: project
---

A tabela `ad_accounts` teve seu schema autoritativo definido na Story 2.1 (Epic 2, OAuth Meta), migration `supabase/migrations/20260101000004_ad_accounts.sql`.

**Why:** O Epic 1 havia feito scaffold prematuro de consumidores de `ad_accounts` (`api/ad-accounts/route.ts`, `lib/queries/ad-accounts.ts`, `components/layout/AdAccountSelector.tsx`, `stores/useActiveAdAccountStore.ts`) usando colunas que NÃO existem no schema real: `name` (real é `account_name`) e `deleted_at` (não existe — ciclo de vida é via coluna `status`: active|expired|error). Story 2.1 reconciliou esses consumidores.

**How to apply:** Ao mexer em `ad_accounts`, o schema correto é: `account_name` (não `name`), sem `deleted_at`, com `encrypted_token`/`encrypted_refresh_token` (NUNCA selecionar em query de UI — usar tipo `AdAccountDisplay` de `@advezo/types`). `external_account_id` é armazenado COM o prefixo `act_` (Meta). Trigger de updated_at no projeto é `public.set_updated_at()` (criado na migration 000003), não `trigger_set_timestamp()`. Migrations seguem convenção de timestamp `20260101NNNNNN_*`, não `000NNN_*`.
