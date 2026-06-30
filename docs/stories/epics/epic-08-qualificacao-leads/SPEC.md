# Spec — Epic 8: Qualificação de Leads

**Versão:** 1.0
**Data:** 2026-06-28
**Autor:** Morgan (@pm)
**Revisão técnica:** Aria (@architect) — gaps 1-5 validados, decisões incorporadas
**Status:** APPROVED — READY FOR STORY CREATION

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-28 | 1.0 | Spec inicial — FRs + schema + workflows + NFRs | Morgan / Aria |

---

## 1. Contexto e Objetivo

### Por que este epic existe

O Advezo v2 captura o resultado de campanhas (conversões via WhatsApp, rastreamento de cliques). O Epic 8 adiciona o **ponto de entrada do funil**: captura estruturada de leads com qualificação configurável e fechamento de loop via Meta CAPI.

Dois canais de entrada:
- **Formulário de landing page** — embed JS em páginas dos clientes
- **Meta Lead Ads nativo** — webhook direto da Meta, sem redirecionamento para landing page

O dado de lead gerado alimenta o mesmo CAPI já construído no Epic 2 (reutilizando `conversion_events`, o sender do `classification-worker` e os tokens OAuth Meta).

### Usuário-alvo

Gestor de tráfego que gerencia contas Meta para clientes. Usa o Advezo para:
1. Criar formulários de captura vinculados a clientes
2. Configurar integração de Lead Ads para uma conta Meta
3. Visualizar leads captados, qualificar manualmente ou por regras
4. Garantir que eventos CAPI `Lead` e `CompleteRegistration` chegam à Meta para otimização de campanha

### Dependências

| Dependência | Status | Nota |
|-------------|--------|------|
| Epic 1 — Auth, Clients, Workspace | Done | `client_id` referenciado em leads |
| Epic 2 — OAuth Meta, CAPI sender | Done | Token Meta reutilizado para Graph API; `conversion_events` extendido |
| Epic 3 (Baileys/WhatsApp) | **Sem dependência** | Epic 8 pode ser priorizado independentemente |

---

## 2. Escopo v1

### Incluído

- Formulário de landing page (embed-only — snippet JS)
- Integração com Meta Lead Ads via webhook nativo
- Qualificação por regras simples configuráveis (AND-logic)
- Ciclo de status do lead: `novo → qualificado | desqualificado → convertido`
- Disparo de eventos CAPI: `Lead` (criação), `CompleteRegistration` (qualificação)
- Deduplicação por banco de dados (UNIQUE INDEX parcial, padrão CP4)
- Consentimento explícito para email em formulário próprio (LGPD Art. 7º I)
- Formulário hosted URL: **fora do escopo** (v2 futura)
- Qualificação por IA (Anthropic): **fora do escopo** (v2 futura)
- Google Ads Lead Form Extensions: **fora do escopo** (v2 futura)
- Webhook de saída para CRM externo: **fora do escopo** (v2 futura)

---

## 3. Functional Requirements

### Pilar A — Formulário de Landing Page (FR-LP)

| ID | Requisito | Prioridade | Notas |
|----|-----------|-----------|-------|
| **FR-LP1** | Gestor cria formulário com campos configuráveis: `name` (obrigatório, fixo), `phone` (obrigatório, fixo, validado como WhatsApp BR), `email` (opcional, depende de FR-LP2), e até 5 campos customizados (tipos: `text`, `select`, `boolean`) | MUST | |
| **FR-LP2** | Campo `email` só pode ser adicionado ao formulário acompanhado de campo `consent_checkbox` obrigatório com texto pré-definido: *"Concordo em compartilhar meus dados para fins de publicidade e marketing"*. Formulários com `email` e sem `consent_checkbox` são inválidos — bloqueados no save | MUST | LGPD Art. 7º I |
| **FR-LP3** | Submissão server-side (`POST /api/leads/submit`): valida telefone, campos required, `embed_token` presente e válido. **Se payload contém `email` mas `consent = false` (ou ausente): rejeitar a submissão com 422 — o servidor não aceita email sem consentimento explícito.** Rate limit: 5 submits/IP/hora + 100/dia/`embed_token` | MUST | Não é "aceitar e ignorar" — é rejeição ativa |
| **FR-LP4** | Submissão válida: cria `lead` com `source='landing_page'`, `status='novo'`, `phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_salt)`, `email_encrypted = AES-256-GCM(email)` apenas se `consent=true`, `consent_given_at = now()` apenas se `consent=true` | MUST | |
| **FR-LP5** | Formulário vinculado a `client_id` (obrigatório) e opcionalmente a `ad_account_id` (para attribution no CAPI) | MUST | |
| **FR-LP6** | Cada formulário gerado com `embed_token` (128 bits, `crypto.randomBytes(16).toString('base64url')`), único e não-adivinhável. Snippet embed: `<script src="https://app.advezo.com.br/embed/form.js?token={embed_token}"></script>` | MUST | |
| **FR-LP7** | Endpoint de submissão com CORS aberto (`Access-Control-Allow-Origin: *`) — necessário para snippet em domínios externos. Autenticação via `embed_token`; proteção via rate limit server-side e validação Zod | MUST | Decisão Gap 2: CORS aberto é correto para embed; segurança vem do token |
| **FR-LP8** | Gestor visualiza lista de leads recebidos por formulário: nome, telefone (exibido parcialmente mascarado), status, data. Email exibido apenas se `consent_given_at IS NOT NULL`, descriptografado server-side | MUST | |
| **FR-LP9** | Gestor ativa/desativa formulário (soft-disable). Formulário desativado: endpoint retorna 410 Gone; snippet exibe mensagem configurável | SHOULD | |
| **FR-LP10** | Gestor pode configurar `allowed_origins text[]` por formulário. Se preenchido, servidor valida header `Origin`. Padrão: null (aceita qualquer origem) | SHOULD | Enhancement opcional v1 |

### Pilar B — Meta Lead Ads Nativo (FR-LA)

| ID | Requisito | Prioridade | Notas |
|----|-----------|-----------|-------|
| **FR-LA1** | Gestor configura integração de Lead Ads por `ad_account_id`: informa o `leadgen_form_id` (ID do formulário criado no Meta Ads Manager) e vincula a um `client_id` | MUST | |
| **FR-LA2** | Endpoint GET `GET /api/webhooks/meta/leadgen`: verifica challenge Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`). Lookup de workspace por `meta_leadgen_verify_token` (índice). Retorna `hub.challenge` se token válido | MUST | |
| **FR-LA3** | Endpoint POST `POST /api/webhooks/meta/leadgen`: valida assinatura `X-Hub-Signature-256 = HMAC-SHA256(raw_body, META_APP_SECRET)` **antes de qualquer processamento**. Rejeita com 403 se inválida | MUST | Sem exceção — validação obrigatória na primeira linha |
| **FR-LA4** | ACK imediato: `200 OK` retornado após validação da assinatura. `INSERT lead_processing_queue { meta_lead_id, ad_account_id, status: 'pending' }`. Processamento assíncrono via cron | MUST | Decisão Gap 1: Railway queue pattern |
| **FR-LA5** | Processamento assíncrono (`POST /api/leads/process-queue`, chamado por cron Railway `*/1 * * * *`): `GET /{meta_lead_id}?fields=field_data&access_token={token_conta}` via Graph API → normaliza campos → INSERT leads com `source='lead_ads'`, `meta_lead_id`, `email_encrypted` (sempre, independente de consent — base legal: termos Meta) | MUST | |
| **FR-LA6** | Deduplicação de webhook: Meta pode entregar o mesmo webhook múltiplas vezes. `UNIQUE INDEX leads(meta_lead_id) WHERE meta_lead_id IS NOT NULL` captura a duplicata com 23505 → retorna `action: 'none'`, não propaga erro | MUST | |
| **FR-LA7** | Falha no processamento de um lead (token expirado, Graph API erro): `sync_errors` inserido com `error_type='lead_processing_failed'`, `retry_count` incrementado, próximo ciclo re-tenta. Máximo 3 tentativas, após isso `status='failed'` | MUST | |

### Pilar C — Qualificação Configurável (FR-QC)

| ID | Requisito | Prioridade | Notas |
|----|-----------|-----------|-------|
| **FR-QC1** | Por `client_id`, gestor configura regras de qualificação via `lead_forms.qualification_rules jsonb`. Estrutura: `[{ field: "campo_x", operator: "eq|contains|filled|not_filled", value: "..." }]`. Todas as regras devem ser satisfeitas (AND-logic) | MUST | OR-logic adiado para v2 |
| **FR-QC2** | Avaliação automática das regras executada imediatamente após INSERT do lead (sincrônico para LP, dentro do `process-queue` para Lead Ads). Se todas as regras passam → `status = 'qualificado'`, `qualified_at = now()`. Se nenhuma regra configurada → `status = 'novo'` (sem avaliação automática) | MUST | |
| **FR-QC3** | Gestor altera status do lead manualmente via Server Action: `novo → qualificado | desqualificado`, `qualificado → desqualificado | convertido`. Status `convertido` é terminal — não pode ser revertido | MUST | |
| **FR-QC4** | Mudança de status `→ qualificado` (automática ou manual): dispara evento CAPI `CompleteRegistration` | MUST | |
| **FR-QC5** | Mudança de status `→ convertido` (manual): dispara evento CAPI `Purchase` (reutiliza fluxo `conversion_events` do Epic 2) | SHOULD | |
| **FR-QC6** | Lead com `status='desqualificado'` libera o slot do UNIQUE INDEX parcial — o mesmo `(client_id, phone_hash)` pode ser inserido novamente em campanha futura | MUST | Consequência natural do índice parcial |

### Pilar D — Eventos CAPI (FR-CAPI)

| ID | Requisito | Prioridade | Notas |
|----|-----------|-----------|-------|
| **FR-CAPI1** | Evento `Lead` disparado na criação do lead (LP ou Lead Ads). `event_id = lead.id` (UUID — deduplicação Meta 7d) | MUST | |
| **FR-CAPI2** | Payload CAPI base para todos os eventos de lead: `event_name`, `event_time`, `event_id = lead.id`, `user_data.ph = HMAC-SHA256(normalizePhone(phone), workspace_salt)` | MUST | |
| **FR-CAPI3** | Para `source='landing_page'`: incluir `user_data.em = SHA256(lowercase(trim(email)))` **somente se `consent_given_at IS NOT NULL`**. Calculado em memória no momento da chamada à API Meta, nunca armazenado como hash. `email_encrypted` é descriptografado server-side apenas para este cálculo | MUST | Gate explícito — não implícito no schema |
| **FR-CAPI4** | Para `source='lead_ads'`: incluir `user_data.em = SHA256(lowercase(trim(email)))` sempre que email disponível (base legal: termos Meta). Incluir `user_data.lead_id = meta_lead_id` (sinal forte de deduplicação Meta) | MUST | |
| **FR-CAPI5** | Evento `CompleteRegistration` disparado em `→ qualificado`. Mesmo payload base (FR-CAPI2) + regras de email (FR-CAPI3/4 conforme source). `event_id = lead.id` (mesma deduplicação) | MUST | |
| **FR-CAPI6** | Gate de envio: `workspace_settings.meta_conversions_api_enabled = true` AND `workspace_settings.meta_pixel_id IS NOT NULL` AND conta Meta com token válido. Sem gate satisfeito → registra `conversion_events` com `status='skipped'` para auditoria | MUST | |
| **FR-CAPI7** | `conversion_events` reutilizada com `event_name IN ('Lead','CompleteRegistration','Purchase')`. Cada evento gera uma linha. Reenvio manual via botão na UI (padrão Epic 2) | MUST | |

---

## 4. Non-Functional Requirements

| NFR | Requisito |
|-----|-----------|
| **NFR-SEC-1** | `embed_token` nunca exposto em logs. `email_encrypted` nunca enviado ao browser em claro |
| **NFR-SEC-2** | `X-Hub-Signature-256` validado antes de qualquer processamento de payload Meta |
| **NFR-SEC-3** | `email_encrypted` usa `TOKEN_ENCRYPTION_KEY` existente (AES-256-GCM, formato `<iv>:<authTag>:<ciphertext>`). Sem nova env var |
| **NFR-SEC-4** | SHA256(email) calculado em memória, nunca persistido como coluna no banco |
| **NFR-LGPD-1** | Consentimento para email no formulário LP: base legal Art. 7º I LGPD (consentimento explícito). `consent_given_at` como audit trail obrigatório |
| **NFR-LGPD-2** | Email de Lead Ads: base legal distinta (dado coletado sob termos da Meta, devolvido ao originador). Documentar distinção em `docs/legal/bases-legais.md` |
| **NFR-LGPD-3** | `leads` segue retenção da política do workspace. Sem nova regra de purga para v1 — lead não é `conversation_message`; retenção definida no Epic de conformidade |
| **NFR-PERF-1** | Webhook ACK < 500ms. Processamento assíncrono: lead disponível no sistema em até 90s (cron 1min + overhead) |
| **NFR-PERF-2** | Rate limit embed: 5 submits/IP/hora + 100/dia/embed_token. Implementado no API Route (sem Redis para v1 — Supabase como store de contagem ou verificação por query) |
| **NFR-PERF-3** | `POST /api/leads/process-queue` processa lote de até 10 leads por execução (`LIMIT 10`, padrão classification-worker). `Promise.allSettled` — falha isolada por item |

---

## 5. Data Model

### Novas tabelas

```sql
-- LEAD_PROCESSING_QUEUE (padrão conversation_classification_queue)
CREATE TABLE lead_processing_queue (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meta_lead_id  text        NOT NULL,
  ad_account_id uuid        NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','completed','failed')),
  retry_count   integer     NOT NULL DEFAULT 0,
  last_error    text,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
ALTER TABLE lead_processing_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_processing_queue
  USING (workspace_id = auth_workspace_id());
-- Dedup de webhook duplicado na fila (Meta pode entregar o mesmo evento mais de uma vez)
CREATE UNIQUE INDEX lead_queue_meta_lead_id_unique ON lead_processing_queue (meta_lead_id);
CREATE INDEX lead_queue_worker_idx ON lead_processing_queue (status, retry_count, enqueued_at)
  WHERE status IN ('pending','failed') AND retry_count < 3;

-- LEAD_FORMS
CREATE TABLE lead_forms (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id           uuid    REFERENCES clients(id) ON DELETE SET NULL,
  ad_account_id       uuid    REFERENCES ad_accounts(id) ON DELETE SET NULL,
  name                text    NOT NULL,
  slug                text    NOT NULL,
  embed_token         text    NOT NULL UNIQUE,
  fields              jsonb   NOT NULL DEFAULT '[]',
  qualification_rules jsonb   NOT NULL DEFAULT '[]',
  allowed_origins     text[],
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_forms USING (workspace_id = auth_workspace_id());

-- LEAD_ADS_CONFIGS
CREATE TABLE lead_ads_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  leadgen_form_id text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, leadgen_form_id)
);
ALTER TABLE lead_ads_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_ads_configs USING (workspace_id = auth_workspace_id());

-- LEADS
CREATE TABLE leads (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id        uuid    REFERENCES clients(id) ON DELETE SET NULL,
  lead_form_id     uuid    REFERENCES lead_forms(id) ON DELETE SET NULL,
  meta_lead_id     text,
  source           text    NOT NULL CHECK (source IN ('landing_page','lead_ads')),
  status           text    NOT NULL DEFAULT 'novo'
                             CHECK (status IN ('novo','qualificado','desqualificado','convertido')),
  name             text    NOT NULL,
  phone_hash       text    NOT NULL,
  email_encrypted  text,
  consent_given_at timestamptz,
  field_data       jsonb   NOT NULL DEFAULT '{}',
  qualified_at     timestamptz,
  converted_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON leads USING (workspace_id = auth_workspace_id());

-- Dedup lead ativo por (client, phone)
CREATE UNIQUE INDEX leads_active_dedup ON leads (client_id, phone_hash)
  WHERE status NOT IN ('desqualificado');

-- Dedup entrega duplicada de webhook Meta
CREATE UNIQUE INDEX leads_meta_lead_id_unique ON leads (meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;

-- Lookup leads por conta
CREATE INDEX leads_account_status_idx ON leads (workspace_id, status, created_at DESC);
```

### Alterações em tabelas existentes

```sql
-- workspace_settings: verify_token e flag de CAPI para leads
ALTER TABLE workspace_settings ADD COLUMN meta_leadgen_verify_token text;
CREATE INDEX ws_verify_token_idx ON workspace_settings (meta_leadgen_verify_token)
  WHERE meta_leadgen_verify_token IS NOT NULL;

-- conversion_events: event_name estendido
ALTER TABLE conversion_events DROP CONSTRAINT conversion_events_event_name_check;
ALTER TABLE conversion_events ADD CONSTRAINT conversion_events_event_name_check
  CHECK (event_name IN ('Purchase','Lead','CompleteRegistration'));
```

### Estrutura de `lead_forms.fields` (jsonb)

```json
[
  { "id": "name",    "type": "text",             "label": "Nome",     "required": true,  "fixed": true },
  { "id": "phone",   "type": "phone",            "label": "WhatsApp", "required": true,  "fixed": true },
  { "id": "email",   "type": "email",            "label": "E-mail",   "required": false, "fixed": false },
  { "id": "consent", "type": "consent_checkbox", "label": "...",      "required": true,  "fixed": false,
    "linked_field": "email" },
  { "id": "q1",      "type": "select",           "label": "...",      "required": false, "fixed": false,
    "options": ["Opção A", "Opção B"] }
]
```

Regra de validação server-side: se `fields` contém um campo `type: 'email'`, deve conter exatamente um campo `type: 'consent_checkbox'` com `linked_field: 'email'`.

### Estrutura de `lead_forms.qualification_rules` (jsonb)

```json
[
  { "field": "q1", "operator": "eq",       "value": "Opção A" },
  { "field": "q2", "operator": "filled",   "value": null      },
  { "field": "q3", "operator": "contains", "value": "palavra" }
]
```

Operadores suportados v1: `eq`, `not_eq`, `contains`, `filled`, `not_filled`.

---

## 6. API Specification

### Novos endpoints

```
# Formulário público (sem auth JWT — autenticado por embed_token)
POST /api/leads/submit
  Body: { embed_token, name, phone, email?, consent?, field_data: {} }
  Headers: CORS open (Access-Control-Allow-Origin: *)
  Response: 201 { lead_id } | 422 { error } | 409 { error: 'lead_already_exists' } | 429

# Webhook Meta Lead Ads
GET  /api/webhooks/meta/leadgen   — challenge verification
POST /api/webhooks/meta/leadgen   — lead notification (assinatura obrigatória)

# Processamento assíncrono (chamado por cron Railway)
POST /api/leads/process-queue     — x-cron-secret obrigatório

# CRUD Formulários (auth JWT)
GET    /api/lead-forms
POST   /api/lead-forms
GET    /api/lead-forms/:id
PUT    /api/lead-forms/:id
DELETE /api/lead-forms/:id        — soft delete (is_active = false)
GET    /api/lead-forms/:id/embed  — retorna snippet JS e instruções

# CRUD Lead Ads Configs (auth JWT)
GET    /api/lead-ads-configs
POST   /api/lead-ads-configs
DELETE /api/lead-ads-configs/:id

# Leads (auth JWT)
GET    /api/leads                 — filtros: client_id, status, source, date_range
GET    /api/leads/:id
```

### Server Actions (mutações UI)

```typescript
updateLeadStatus(leadId: string, status: LeadStatus): Promise<{ error?: string }>
// Ciclo permitido: novo→qualificado, novo→desqualificado, qualificado→desqualificado,
// qualificado→convertido, desqualificado→novo (re-aquisição), convertido→(bloqueado)
// Dispara CAPI conforme status destino (FR-QC4, FR-QC5)

bulkUpdateLeadStatus(leadIds: string[], status: LeadStatus): Promise<{ updated: number; errors: string[] }>
// Atualização em lote para gestores que qualificam/descartam leads em volume
```

---

## 7. Workflows Principais

### Workflow 1: Submissão de Formulário LP

```
Browser (domínio do cliente) → POST /api/leads/submit { embed_token, ... }

1. Valida embed_token → encontra lead_form → verifica is_active
2. Rate limit: IP + embed_token (Supabase query count)
3. Zod validation:
   - phone: formato WhatsApp BR válido
   - email presente? → consent obrigatório = true, senão 422 REJECTED
4. phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_salt)
5. email_encrypted = AES-256-GCM(email) SE consent=true, senão NULL
6. INSERT leads { source='landing_page', status='novo', consent_given_at: now() se consent }
   → 23505? → 409 lead_already_exists (idempotente)
7. Avaliar qualification_rules → status = 'qualificado' se todas passam
8. INSERT conversion_events { event_name='Lead' } → POST Meta CAPI (assíncrono)
9. Se qualificado: INSERT conversion_events { event_name='CompleteRegistration' } → CAPI
10. 201 Created { lead_id }
```

### Workflow 2: Lead Ads Webhook

```
Meta → POST /api/webhooks/meta/leadgen

1. Valida X-Hub-Signature-256 (HMAC-SHA256 raw_body + META_APP_SECRET) → 403 se inválida
2. INSERT lead_processing_queue { meta_lead_id, ad_account_id, status='pending' }
   → 23505 meta_lead_id_unique? → idempotente, skip
3. 200 OK imediato

[cron Railway */1 * * * *]
POST /api/leads/process-queue (x-cron-secret)
  Para cada item pending (LIMIT 10, Promise.allSettled):
    1. GET /{meta_lead_id}?fields=field_data&access_token={token_conta} via Graph API
    2. Normaliza campos → phone, name, email (sempre disponível do Lead Ad)
    3. phone_hash = HMAC-SHA256(normalizePhone(phone), workspace_salt)
    4. email_encrypted = AES-256-GCM(email) [sempre para lead_ads]
    5. Encontra lead_ads_config por ad_account_id + leadgen_form_id
    6. INSERT leads { source='lead_ads', meta_lead_id, status='novo' }
       → 23505 leads_meta_lead_id_unique? → action:'none', skip CAPI
    7. Avaliar qualification_rules do client
    8. INSERT conversion_events 'Lead' → CAPI (user_data.lead_id=meta_lead_id, user_data.em=SHA256(email))
    9. Se qualificado: INSERT conversion_events 'CompleteRegistration' → CAPI
    10. UPDATE lead_processing_queue SET status='completed'
    [erro]: retry_count++; se >= 3 → status='failed'; INSERT sync_errors
```

### Workflow 3: Qualificação Manual + CAPI

```
Gestor → updateLeadStatus(leadId, 'qualificado') [Server Action]

1. Auth guard → workspace_id
2. Valida transição de status (não permite converter → outro)
3. UPDATE leads SET status='qualificado', qualified_at=now(), updated_at=now()
4. CAPI gate:
   - workspace_settings.meta_conversions_api_enabled = true?
   - workspace_settings.meta_pixel_id IS NOT NULL?
   - ad_account (se vinculado) token válido?
   → Não: INSERT conversion_events { status='skipped' } para auditoria
   → Sim: continua
5. Calcula user_data:
   - ph = HMAC-SHA256(normalizePhone(...), workspace_salt) [sempre]
   - em = SHA256(lowercase(trim(decryptToken(lead.email_encrypted)))) [se source='landing_page': só com consent_given_at; se source='lead_ads': sempre]
6. INSERT conversion_events { event_name='CompleteRegistration', status='pending' }
7. POST Meta Conversions API
8. UPDATE conversion_events SET status='sent'|'failed'
9. revalidatePath('/leads') + revalidatePath('/dashboard')
```

---

## 8. Estrutura de Stories Proposta

> Para criação detalhada: `@sm *draft` a partir desta spec

| # | Story | Pilares | Complexidade estimada |
|---|-------|---------|----------------------|
| 8.1 | Schema e migrations (4 tabelas + alterações) | Infra | M |
| 8.2 | Formulário: CRUD de lead_forms + geração de embed_token + snippet JS | FR-LP1/2/6 | M |
| 8.3 | Endpoint de submissão do formulário (LP) com rate limit, validação consent, dedup CP4 | FR-LP3/4/7 | L |
| 8.4 | Qualificação por regras: avaliação automática + Server Action manual | FR-QC1/2/3 | M |
| 8.5 | Meta Lead Ads: webhook verify + ACK + lead_processing_queue | FR-LA2/3/4 | M |
| 8.6 | Processamento assíncrono: process-queue cron + Graph API + dedup meta_lead_id | FR-LA5/6/7 | L |
| 8.7 | Eventos CAPI (Lead + CompleteRegistration) com gate de consent por fonte | FR-CAPI1-7 | L |
| 8.8 | UI de leads: lista, detalhe, ações de status, badge de consent | FR-LP8 + FR-QC3 | M |
| 8.9 | Documentação legal: atualizar bases-legais.md com duas bases distintas | NFR-LGPD-1/2 | S |

**QA Gate recomendado:** interativo + completo para Stories 8.3 (consent + rate limit), 8.5/8.6 (segurança webhook), 8.7 (CAPI — dado financeiro de campanha). YOLO para 8.1, 8.2, 8.8, 8.9.

> **AC obrigatório para Story 8.3 (segurança LGPD):** @sm DEVE incluir AC com cenário de teste explícito para o caminho de rejeição — payload com `email` presente e `consent = false` ou ausente → resposta 422. Não é suficiente testar só o caminho de aceitação (consent = true → 201).

---

## 9. Rastreabilidade de FRs

| FR | Decisão origem | Rastreia a |
|----|---------------|------------|
| FR-LP2/LP3 | @architect Gap 5 + correção LGPD | Art. 7º I LGPD — consentimento explícito |
| FR-LP7 | @architect Gap 2 | CORS aberto = necessário para embed; segurança via embed_token |
| FR-CAPI3 | @architect Gap 5 + correção PM | email em LP: gate explícito `consent_given_at IS NOT NULL` |
| FR-CAPI4 | Q1 PM (resposta sobre Lead Ads) | email em Lead Ads: base legal termos Meta |
| FR-LA4 | @architect Gap 1 | Railway queue pattern — ACK < 500ms garantido |
| FR-QC6 | @architect Gap 3 | UNIQUE INDEX parcial libera slot de desqualificado |
| FR-LA6 | @architect Gap 3 | Segundo índice: `leads(meta_lead_id)` — double-delivery Meta |

---

*Spec gerada por Morgan (@pm) com revisão técnica de Aria (@architect) — Advezo v2 Epic 8 — v1.0 — 2026-06-28*
