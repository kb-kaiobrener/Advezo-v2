---
name: capi-leads-dispatch
description: Story 8.7 CAPI dispatch — schema gaps (no meta_conversions_api_enabled, no conversion_events table), gate logic, lead.ts compat layer
metadata:
  type: project
---

Story 8.7 implementou o disparo real à Meta Conversions API para leads em `apps/web/src/lib/capi/leads.ts` (núcleo) com `lead.ts` (singular) como camada de compatibilidade.

**Why:** Eventos `Lead`/`CompleteRegistration` à Meta CAPI com gate de consentimento LGPD diferenciado por fonte e dado de cliente real (email descriptografado em memória).

**How to apply (gaps de schema reusáveis para Epic 8+ e qualquer story CAPI):**

1. **`workspace_settings.meta_conversions_api_enabled` NÃO existe** no schema aplicado (só `meta_pixel_id`). Em `checkCAPIGate`, NÃO selecione a coluna diretamente (PostgREST erra → quebra o gate). Use `.select('*')` e leia a flag defensivamente (`=== false` bloqueia; ausente = não bloqueia). O gate operativo real é `meta_pixel_id IS NOT NULL` + `ad_accounts.status != 'expired'` + token decriptável.

2. **`conversion_events` NÃO existe em nenhuma migration aplicada** (confirmado na 000009 — só estende o CHECK condicionalmente via `to_regclass`). Persistência de auditoria (`skipped`/`pending`/`sent`/`failed`) é guardada por `conversionEventsExists()` que detecta erro `PGRST205`/`42P01`. Quando ausente, resultado é retornado/logado mas não persistido. Núcleo ativa persistência automaticamente quando a tabela existir (epic futuro).

3. **Token Meta vem de `ad_accounts.encrypted_token`** (decryptToken), não de coluna `meta_system_access_token` (inexistente).

4. **`lead.ts` (singular) é camada de compatibilidade**: os callers 8.3/8.4 (`/api/leads/submit/route.ts`, `app/actions/leads.ts`) usam assinaturas legadas (`LeadCapiInput` objeto, `StatusCapiLead+leadId`). Re-hidratam a linha de `leads` do banco e delegam ao núcleo `leads.ts` (`buildUserData(lead)`). Não quebrar essas assinaturas — há testes existentes.

5. **SHA256(email)** calculado em `buildUserData` a partir de `decryptToken(email_encrypted)` em memória; nunca persistido. Gate de email: `lead_ads` sempre (base legal Meta); `landing_page` só com `consent_given_at !== null` (LGPD). `phone_hash` usado direto como `ph` (já é HMAC). Ver [[leads-public-endpoint]] e [[ad-accounts-schema]].

6. **Caminho `source='lead_ads'` testável só por mock** até Story 8.6 (process-queue) popular `leads` com lead_ads. Integração ponta-a-ponta = Wave 4.
