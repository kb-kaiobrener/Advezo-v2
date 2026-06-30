---
name: leads-dual-legal-basis
description: Epic 8 leads have TWO distinct legal bases by source; consent_given_at IS NULL for lead_ads is correct, not a bug
metadata:
  type: project
---

O módulo de leads (Epic 8) trata email sob **duas bases legais distintas**, discriminadas pela coluna `source` de `leads`:

- `source='landing_page'` → **consentimento LGPD Art. 7º I**. Email só é armazenado/enviado se `consent_given_at IS NOT NULL`. Servidor rejeita 422 se email sem consent.
- `source='lead_ads'` → **termos de serviço da Meta**. `consent_given_at` fica **NULL** (consentimento vive na Meta, não no Advezo). Email enviado à CAPI sempre que disponível.

**Why:** São bases legais legalmente diferentes — tratar como única violaria LGPD (email de LP sem consent) ou desperdiçaria conversão legítima (segurando email de Lead Ads que já tem base válida).

**How to apply:** Ao tocar código/testes de leads ou CAPI: `consent_given_at IS NULL` em lead `lead_ads` é o estado **esperado**, NÃO erro de integridade. O gate de email por fonte vive em `buildUserData` (`apps/web/src/lib/capi/leads.ts`). UI mostra badge "Meta Terms" (lead_ads) vs "Consentimento LGPD" (landing_page). Documentado em `docs/legal/bases-legais.md`.

Três padrões de hash/cripto intencionalmente diferentes: `phone_hash` = HMAC-SHA256+workspace_salt (dado interno, anti-rainbow-table); `user_data.em` CAPI = SHA256 puro em memória, nunca persistido (Meta exige sem salt p/ matching); `email_encrypted` = AES-256-GCM (reversível, gestor vê email na UI).
