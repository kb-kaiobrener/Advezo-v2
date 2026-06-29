# Advezo v2 — Documento de Arquitetura Técnica

**Versão:** 1.0  
**Data:** 2026-06-24  
**Autor:** Aria (@architect) / Kaio Brener  
**Status:** APPROVED — READY FOR IMPLEMENTATION

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-24 | 1.0 | Versão inicial — arquitetura completa do Advezo v2 | Aria / Kaio |

---

## 1. Introduction

Este documento define a arquitetura técnica completa do **Advezo v2** — um SaaS multi-tenant de gestão de tráfego pago com módulo de rastreamento de vendas via WhatsApp. Serve como fonte única de verdade para o desenvolvimento orientado por agentes AIOX, cobrindo decisões de backend, frontend, infraestrutura e integrações externas.

A arquitetura unifica o que tradicionalmente seriam documentos separados de backend e frontend, refletindo a natureza fullstack integrada do Next.js App Router — onde Server Components, API Routes e o cliente React convivem no mesmo repositório e pipeline de deploy.

### Starter Template

**N/A — Projeto Greenfield com preset ativo.**

O projeto parte do zero com o preset `nextjs-react` do AIOX:
- **Next.js 16+** com App Router (não Pages Router)
- **TypeScript 5+** com strict mode
- **Tailwind CSS 3.x** + **ESLint/Prettier** pré-configurados
- **Supabase** para banco de dados, autenticação e storage
- **Zustand** para estado global client-side
- **Node.js 20+ LTS** — requisito mínimo documentado em `engines` no `package.json`

Não há starter template externo (T3 Stack, create-t3-app, etc.) — a Story 1.1 inicializa o projeto com `create-next-app`. Supabase foi escolhido deliberadamente em vez de Prisma + NextAuth por viabilizar isolamento multi-tenant via RLS nativo sem implementação adicional.

### Contexto da v1

Este documento de arquitetura é uma reconstrução completa em repositório novo, mas incorpora aprendizados técnicos diretos da v1 — especialmente:
- **Instabilidade do Chromium/Puppeteer** → resolvida com Baileys + Railway
- **Perda de sessão WhatsApp em deploys** → resolvida com sessão no Supabase Storage
- **Lógica de deduplicação de conversões Meta Ads** → a ser preservada na Story 2.3

Esses aprendizados orientam decisões específicas ao longo deste documento.

---

## 2. High Level Architecture

### Overview

O Advezo v2 distribui responsabilidades em três plataformas complementares:

| Plataforma | Componentes | Papel principal |
|-----------|-------------|-----------------|
| **Vercel** | Next.js 16+ App Router + Edge Function | UI, API Routes, redirect de rastreamento em < 300ms |
| **Supabase** | PostgreSQL + Auth + Storage | Persistência multi-tenant com RLS, autenticação JWT |
| **Railway** | WhatsApp Worker + Classification Worker | Processos de longa duração e fila de classificação assíncrona |

> **Supabase Realtime:** infraestrutura disponível no Supabase, mas **não utilizada nos Epics 1-7**. Os dashboards atualizam a cada sync ou por filtro manual. Não introduzir como trabalho implícito.

### Topologia do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                           VERCEL                                │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │    Next.js App Router    │    │     Edge Function         │  │
│  │  Server Components       │    │   GET /t/[code]           │  │
│  │  API Routes (/api/*)     │    │   SLA: < 300ms P95        │  │
│  └────────────┬─────────────┘    └───────────┬───────────────┘  │
└───────────────┼──────────────────────────────┼─────────────────┘
                │                              │ redirect
                ▼                              ▼
┌───────────────────────────────────────┐   destino final
│              SUPABASE                 │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  PostgreSQL  │  │     Auth      │  │  JWT claim: workspace_id
│  │  (RLS por   │  │  (email+magic │  │  RLS: todas as queries
│  │  workspace) │  │   link + pwd) │  │  filtradas por workspace
│  └─────────────┘  └───────────────┘  │
│  ┌─────────────┐                     │
│  │   Storage   │                     │
│  │  (sessão    │                     │
│  │   Baileys)  │                     │
│  └─────────────┘                     │
└──────────────────┬────────────────────┘
                   │ pg (service key)
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                           RAILWAY                               │
│  ┌───────────────────────────┐  ┌──────────────────────────┐  │
│  │     WhatsApp Worker       │  │   Classification Worker  │  │
│  │     (Baileys / Node.js)   │  │   (cron: a cada 5 min)   │  │
│  │  • Mantém sessão WA       │  │  • Busca itens na fila   │  │
│  │  • Recebe mensagens       │  │  • Chama Anthropic API   │  │
│  │  • Match de clique (LIFO) │  │  • Retry: max 3 vezes    │  │
│  │  • Enfileira classificação│  │  • Job LGPD 90d diário   │  │
│  └───────────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Padrão de Isolamento Multi-tenant

```sql
-- Helper function — evita repetição em todas as policies
CREATE OR REPLACE FUNCTION auth_workspace_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Padrão aplicado a todas as tabelas principais
CREATE POLICY workspace_isolation ON <table>
  USING (workspace_id = auth_workspace_id());
```

O `workspace_id` é injetado no JWT no momento da autenticação via Supabase Auth hook. Railway acessa o Postgres com service key e filtra `workspace_id` explicitamente em toda query (dupla camada de segurança).

### Aprendizados da v1 Relevantes

| Problema v1 | Solução v2 |
|-------------|-----------|
| Chromium/Puppeteer instável (400-500 MB RAM) | Baileys (WebSocket puro, sem browser) |
| whatsapp-web.js dependente de Chromium | Baileys no Railway (Node.js puro) |
| Sessão WA perdida em cada deploy | Sessão persistida no Supabase Storage |
| Oracle Cloud VM instável por RAM | Railway gerenciado com restart automático |

---

## 3. Tech Stack

### Linguagem e Runtime

| Item | Decisão |
|------|---------|
| **Linguagem** | TypeScript 5+ (strict mode) |
| **Node.js** | 20+ LTS (`engines` field no `package.json`) |
| **Package manager** | pnpm (workspaces para monorepo) |

### Frontend

| Item | Decisão |
|------|---------|
| **Framework** | Next.js 16+ App Router |
| **Estilização** | Tailwind CSS 3.x |
| **Componentes base** | ShadCN/ui (headless, Tailwind-native, sem lock-in) |
| **Estado global** | Zustand |
| **Estado de servidor** | TanStack Query v5 (cache + invalidação + hydration pattern) |
| **Formulários** | React Hook Form + Zod |
| **Validação de schema** | Zod (compartilhado frontend ↔ API Routes) |
| **Ícones** | Lucide React |
| **Gráficos** | Recharts (leve, SSR-friendly) |
| **Datas** | date-fns |
| **Dark mode** | Adiado para pós-Beta v2 |
| **Responsividade** | Desktop-first com breakpoint mobile mínimo |

> TanStack Query mantido (não substituído por RSC puro) — Stories 2.6 e 7.4 requerem mutações interativas com feedback visual imediato sem reload.

### Backend (Next.js)

| Item | Decisão |
|------|---------|
| **API pattern** | App Router API Routes + Server Actions para mutations simples de UI |
| **Server Actions vs API Routes** | Server Actions: mutations de UI sem integração externa (criar/editar cliente, toggle de config). API Routes: integrações externas (Meta/Google/Anthropic), chamadas de workers, respostas 202 assíncronas |
| **HTTP client** | `fetch` nativo (Node 20+) |
| **Auth middleware** | `@supabase/ssr` + `middleware.ts` |

### Database & Backend Services

| Item | Decisão |
|------|---------|
| **Banco** | PostgreSQL 15+ via Supabase |
| **Client (Vercel)** | `@supabase/supabase-js` (RLS automático via JWT) |
| **Client (Railway)** | `pg` (node-postgres) + service key |
| **Migrations** | Supabase CLI (`supabase/migrations/`) |
| **Storage** | Supabase Storage (sessão Baileys + imports CSV) |

### Workers (Railway)

| Item | Decisão |
|------|---------|
| **Runtime** | Node.js 20+ LTS |
| **WhatsApp** | Baileys (última versão estável — critério 24h de estabilidade) |
| **Scheduler** | `node-cron` |
| **Logging** | `pino` (JSON estruturado) |
| **Build** | Railway Nixpacks (sem Dockerfile — Node.js puro, sem Chromium) |

### Testes

| Item | Decisão |
|------|---------|
| **Unit/Integration** | Vitest |
| **Componentes** | React Testing Library |
| **E2E** | Playwright (`tests/e2e/` na raiz do monorepo) |
| **Mock de APIs externas** | MSW (Mock Service Worker) |
| **Extensão de arquivos** | `.test.ts` (não `.spec.ts`) |
| **a11y** | axe-core (incremental — componentes críticos primeiro) |

### Dev Tools

| Item | Decisão |
|------|---------|
| **Linting** | ESLint (Next.js defaults + regras customizadas) |
| **Formatação** | Prettier |
| **Git hooks** | Husky + lint-staged (fail-fast antes do CI) |
| **Type check** | `tsc --noEmit` |
| **CI** | GitHub Actions (lint + typecheck + test em cada PR) |

---

## 4. Data Models

### Mapa de Entidades

```
auth.users (Supabase)
    └──< workspace_members >── workspaces
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                   │
               clients        tracked_links      whatsapp_accounts
                    │               │                   │
              ad_accounts    tracked_clicks        conversations
                    │          (LIFO match)              │
            ┌───────┴────┐                    ┌──────────┴──────────┐
         campaigns    ad_sets              conversation_messages  classification_queue
             │           │                  (LGPD 90d retention)
      campaign_insights  ads
      
workspaces ── workspace_settings (1:1, auto-criado via trigger)
conversations ── conversion_events
users ── ai_chat_sessions ── ai_chat_messages
```

### Entidades Principais

**`ad_account_credentials`** (1:1 com `ad_accounts`, service key apenas):
- `access_token_encrypted` (AES-256 no nível da aplicação)
- `refresh_token_encrypted`
- `token_expires_at`
- RLS: `deny_all` — inacessível via browser client

**`conversations`**:
- `UNIQUE (whatsapp_account_id, phone_number_hash)` — previne race condition do worker criando duas conversas para o mesmo número
- `phone_number_hash` — HMAC-SHA256 com salt por workspace (pseudonimização LGPD)

**`tracked_clicks`**:
- `phone_number_hash` — preenchido **após** match com conversa (não no momento do clique)
- `gclid` — extraído de `?gclid=` no redirect Edge Function

**`whatsapp_accounts`**:
- `cb_failure_count` integer — contador do circuit breaker (persistido, sobrevive a restarts)
- `cb_paused_at` timestamptz — quando definido, circuit está aberto

**`ai_chat_sessions`** (suporta Story 7.2 — múltiplas conversas por usuário):
- `id`, `workspace_id`, `user_id`, `ad_account_id`, `title`, `created_at`, `last_message_at`

**`workspace_settings`** (criada automaticamente via trigger no INSERT de `workspaces`):
- `classification_confidence_threshold` numeric(4,3) DEFAULT 0.700 (mínimo 0.500)

---

## 5. API Specification

### Convenções Globais

```
Base: /api/
Formato: JSON (application/json)
Auth: Bearer JWT via Supabase Auth (header Authorization)
Erros: { error: { code: string, message: string, details?: unknown } }
Sucesso: { data: T, meta?: { total?: number, cursor?: string } }
Paginação: cursor-based
Versão: sem prefixo /v1/ no Beta
```

### Endpoints por Domínio

#### Auth & Workspace
```
POST /api/auth/invite
DELETE /api/auth/members/:userId
GET  /api/workspaces/me
PUT  /api/workspaces/me
GET  /api/settings
PUT  /api/settings
PUT  /api/settings/threshold      # confidence threshold (Story 5.6)
```

#### Clientes
```
GET    /api/clients
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id
DELETE /api/clients/:id           # soft delete
```

#### Contas de Anúncio
```
GET    /api/ad-accounts
POST   /api/ad-accounts
PUT    /api/ad-accounts/:id
DELETE /api/ad-accounts/:id
GET    /api/oauth/meta/callback
GET    /api/oauth/google/callback
```

#### Campanhas, Ad Sets e Anúncios
```
GET  /api/campaigns
GET  /api/campaigns/:id
GET  /api/campaigns/:id/insights
PUT  /api/campaigns/:id/budget    # rate limit: 1/conta/minuto
PUT  /api/campaigns/:id/status
POST /api/campaigns/sync          # 202 Accepted — async com polling
GET  /api/ad-accounts/:id/ad-sets
GET  /api/ad-accounts/:id/ads
```

**Contrato `PUT /api/campaigns/:id/budget`:**
```typescript
// Request body
{ budget: number, budgetType: 'daily' | 'total', currency: 'BRL' | 'USD' }

// Validações: budget > 0, currency válida, conta ativa
// Comportamento em falha da API externa: rollback — não atualiza DB se Meta/Google rejeitar
// Rate limit: 1 req/conta/minuto (verifica last_synced_at antes de disparar)
```

**Sync assíncrono — mecanismo de polling:**
- `POST /api/campaigns/sync` → 202 Accepted `{ syncing: true }`
- Worker usa `waitUntil()` de `@vercel/functions` (não `void` — garante processo vivo pós-return)
- UI faz polling em `GET /api/ad-accounts/:id` a cada 3s (máx 60s / 20 tentativas)
- Detecta `last_synced_at` atualizado → invalida cache TanStack Query
- Timeout: "Sync demorou mais que o esperado — tente novamente"

#### Links Rastreáveis
```
GET    /api/tracked-links
POST   /api/tracked-links
PUT    /api/tracked-links/:id
DELETE /api/tracked-links/:id
GET    /api/tracked-links/:id/clicks
```

#### Edge Function — Redirect de Rastreamento
```
GET /t/[code]    Edge Function (runtime: 'edge')
                 → SLA: < 302ms P95
                 → rate limit leve por IP (Vercel Edge KV) — proteção anti fraude de clique
                 → 302 Found
```

#### WhatsApp
```
GET    /api/whatsapp/accounts
POST   /api/whatsapp/accounts
GET    /api/whatsapp/accounts/:id/qr
DELETE /api/whatsapp/accounts/:id
PUT    /api/whatsapp/accounts/:id     # template LGPD
```

#### Conversas e Classificação
```
GET  /api/conversations
GET  /api/conversations/:id
PUT  /api/conversations/:id/classify
POST /api/conversations/:id/retry
GET  /api/classification/queue/stats
```

#### Conversões e Relatórios
```
GET  /api/conversions
POST /api/conversions/:id/send        # reenvio manual (reutiliza event_id original)
GET  /api/conversions/report          # CSV download
```

#### AI Chat
```
POST /api/ai/chat        # streaming SSE — SLA < 2-3s primeiro token
GET  /api/ai/chat/history
```

#### Health Checks (Internos)
```
GET /api/internal/health             # Next.js
GET /health                          # whatsapp-worker (Express)
GET /health                          # classification-worker (Express)
```

### SLAs de Performance Consolidados

| Endpoint | SLA | Mecanismo |
|----------|-----|-----------|
| `GET /t/[code]` | < 300ms P95 | Edge Function + `waitUntil()` |
| Campaign sync (Meta) | < 30s | Background + polling |
| Campaign sync (Google) | < 60s | Background + polling |
| Listagem de campanhas | < 500ms P95 | Index `(workspace_id, status)` |
| Listagem de conversas | < 800ms P95 | Index composto |
| AI Chat — primeiro token | < 2-3s | Streaming SSE single-model |
| WhatsApp match + enqueue | < 2s | Operação síncrona no worker |
| Classificação assíncrona | < 5 min | Queue polling 5 min |

---

## 6. Components

### Monorepo — Estrutura de Pacotes

```
apps/
├── web/                  → Vercel (Next.js App Router)
├── whatsapp-worker/      → Railway Service 1 (Baileys)
└── classification-worker/ → Railway Service 2 (cron + Anthropic)

packages/
├── database/      Supabase client factory (3 modos) + tipos gerados
├── external-apis/ Clientes tipados: MetaClient, GoogleAdsClient, AnthropicClient
├── mocks/         Implementações mock (dev + testes)
├── types/         Tipos TypeScript + Zod schemas compartilhados
├── utils/         HMAC, normalizePhone, date, pagination, api helpers
└── test-utils/    Factories: createTestWorkspace(), createTestCampaign(), etc.
```

### Serviços Internos

| Serviço | App | Responsabilidade |
|---------|-----|-----------------|
| `CampaignSyncService` | `external-apis` | Strategy pattern Meta/Google — upsert campaigns/insights/ad_sets/ads |
| `TrackingService` | `web` | Gera `code` único (crypto.randomBytes), resolve cliques |
| `ClickMatchingService` | `whatsapp-worker` | LIFO cross-link match (sem filtro por link_id) |
| `ClassificationQueueService` | `classification-worker` | Poll fila, Anthropic, retry, update conversations |
| `ConversionService` | `classification-worker` | Envia para Meta/Google Conversions API |
| `AIChatService` | `web` | Verifica permissões → injeta contexto fechado → stream Anthropic |
| `RetentionCleanupJob` | `classification-worker` | Purge diário 90d + alerta crítico de compliance |

---

## 7. External APIs

### Estratégia de Sandbox por Ambiente

| Ambiente | `MOCK_EXTERNAL_APIS` | APIs reais |
|---------|---------------------|-----------|
| local (dev) | `true` | Anthropic (haiku, custo baixo) |
| preview (Vercel) | `true` | nenhuma |
| staging | `false` | Meta Test Ad Account + Google test customer |
| production | `false` | Contas reais dos clientes |

**Padrão de injeção:**
```typescript
// packages/external-apis/src/factory.ts
export function createMetaClient(creds: AdAccountCredentials) {
  if (process.env.MOCK_EXTERNAL_APIS === 'true') {
    return new MockMetaClient(); // fixture data realista
  }
  return new MetaMarketingClient(creds);
}
```

Cada cliente externo tem sua própria função de classificação de erro, normalizada para formato comum antes de chegar no `withRetry` genérico:

```typescript
// Meta: códigos numéricos (190 = auth, 4/17 = rate limit)
// Google: strings (AUTHENTICATION_ERROR, RESOURCE_EXHAUSTED)
// Anthropic: overloaded_error, rate_limit_error
```

### Meta Marketing API

| Item | Detalhe |
|------|---------|
| Auth | OAuth 2.0 — long-lived token (60d) em `ad_account_credentials` |
| SDK | `facebook-nodejs-business-sdk` |
| Rate limit | 200 calls/hora por ad account |
| Sandbox | Facebook Test Ad Account no Business Manager |
| Erro 190 | Token expirado → marcar conta `disconnected`, alert no dashboard |
| Token refresh | Meta não suporta refresh padrão — usuário reconecta via OAuth; `token_expires_at` dispara alerta 7d antes |

### Meta Conversions API

**Payload enviado — decisão documentada de privacidade por design:**

```
ENVIADOS:
  user_data.ph  = HMAC-SHA256(phone, workspace_salt)  ← pseudonimizado
  event_name    = 'Purchase'
  event_time    = unix timestamp
  event_id      = conversion_events.id (UUID — deduplicação Meta 7d)

DELIBERADAMENTE OMITIDOS (não coletados pelo produto):
  user_data.em  (email)
  user_data.fn  (first_name)
  user_data.ln  (last_name)
  user_data.ct  (city)
```

> Qualquer adição de campo requer revisão de base legal e atualização de `docs/legal/`.

**Reenvio manual:** reutiliza o `event_id` original (`conversion_events.id`) — Meta deduplica em janela de 7 dias, prevenindo double-count se o envio original chegou mas retornou erro de rede.

### Google Ads API

| Item | Detalhe |
|------|---------|
| Auth | OAuth 2.0 com refresh token + developer token |
| SDK | `google-ads-api` (npm) |
| GCLID | Extraído de `?gclid=` no redirect Edge Function, salvo em `tracked_clicks.gclid` |
| Sandbox | Google Ads test account (`testAccount: true`) |

### Anthropic API

| Item | Detalhe |
|------|---------|
| Auth | `ANTHROPIC_API_KEY` env var |
| SDK | `@anthropic-ai/sdk` |
| Classificação | `claude-haiku-4-5` (custo ~10x menor, suficiente para classificação) |
| AI Chat | `claude-sonnet-4-6` (qualidade para análise de campanha) |
| Mock | Real API em dev local (haiku); MSW apenas em unit tests |
| NFR-8 | Anthropic documentado em `docs/legal/subprocessors.md` como processador LGPD |

**Campos injetados no prompt AI Chat (lista fechada — Story 7.3):**
```
ad_account: { name, platform, status }
campaigns:  [{ name, status, daily_budget, currency }] (últimas 10 ativas)
insights_7d:  { spend, clicks, impressions, cpc, cpm, roas, conversions }
insights_30d: { spend, clicks, impressions, cpc, cpm, roas, conversions }

NUNCA inclui: access_token, phone_number_hash, dados de leads, dados de outros workspaces
```

### Baileys (WhatsApp)

| Item | Detalhe |
|------|---------|
| Library | `@whiskeysockets/baileys` (última versão estável) |
| Sessão | Supabase Storage: `{workspace_id}/wpp/{account_id}/session.json` |
| Sandbox | Número WA secundário dedicado ao ambiente de desenvolvimento |
| Circuit breaker | 5 falhas de reconexão em 10 min → `cb_paused_at = now()` em `whatsapp_accounts` → alerta ao usuário |
| Sessão corrompida | Tenta recarregar do Storage; se inválida → força novo QR code |
| Grupos | Suportados — Story 3.5 usa `groupJid` do Baileys |

---

## 8. Core Workflows

### Workflow 1: Captura de Clique Rastreado

```
Browser → GET /t/{code} (Edge Function, runtime: 'edge')
  1. SELECT tracked_links WHERE code = ? AND is_active = true (service key)
  2. code não encontrado → 302 para /not-found
  3. Extrai: ip_hash, user_agent, gclid, fbclid, referrer
  4. ctx.waitUntil(insertClick(...)) ← não bloqueia o redirect
     try/catch interno: erro → log pino + Sentry (nunca silencioso)
  5. 302 → destination_url

SLA: < 300ms P95
Rate limit: por IP via Vercel Edge KV (anti fraude de clique)
```

### Workflow 2: WhatsApp → Match de Clique → Fila

```
mensagem recebida (Baileys event)
  1. phone → HMAC-SHA256(normalizePhone(phone), workspace_salt)
  2. Busca conversa existente (phone_hash + whatsapp_account_id)

[CONVERSA NOVA]
  3a. Envia aviso LGPD (lgpd_notice_template)
  3b. Match de clique LIFO cross-link:
      SELECT tracked_clicks
      WHERE matched_at IS NULL
        AND clicked_at > NOW() - INTERVAL '7 days'
        AND workspace_id = ?
      ORDER BY clicked_at DESC LIMIT 1
      -- SEM filtro por link_id — comportamento cross-link intencional (Story 4.4)
      -- Vincula ao clique mais recente entre TODOS os links do destino
  3c. INSERT conversations
  3d. UPDATE tracked_clicks SET phone_number_hash = ?, matched_at = now()
  3e. INSERT conversation_classification_queue

[CONVERSA EXISTENTE]
  Atualiza last_message_at

  4. INSERT conversation_messages (content, direction='inbound', message_at)

Circuit breaker: 5 reconexões falhas em 10 min
  → UPDATE whatsapp_accounts SET cb_failure_count = 5, cb_paused_at = now()
  → Alerta visível na UI (Story 3.4)
  → Estado persiste no DB — sobrevive a restarts do Railway
```

### Workflow 3: Pipeline de Classificação AI

```
[cron: */5 * * * *]
  1. SELECT queue WHERE status='pending' AND retry_count < 3 LIMIT 10
  2. Para cada item (Promise.allSettled — erro isolado por item):
     a. UPDATE queue SET status='processing'
     b. SELECT conversation_messages (últimas mensagens)
     c. POST Anthropic (claude-haiku-4-5) → { result, confidence, reasoning }

     [confidence >= workspace_threshold]
     d. UPDATE conversations (classified)
     e. Se result='converted' AND meta_enabled: INSERT conversion_events + POST Meta API
     f. UPDATE queue SET status='completed'

     [confidence < threshold]
     d. UPDATE conversations (classificado, mas marcado para revisão manual — Story 5.4)
     e. UPDATE queue SET status='completed'

     [erro]
     d. INCREMENT retry_count
     e. Se retry_count >= 3: SET status='failed', last_error = err.message

[cron diário: 02:00 UTC + retry a cada 5min se falhou]
  RetentionCleanupJob:
  - DELETE conversation_messages WHERE message_at < NOW() - INTERVAL '90 days'
  - INSERT retention_jobs (records_deleted, status='completed')
  - FALHA: alerta crítico (canal do heartbeat) + Sentry fatal
  - NÃO lança exceção — próximo cron tenta automaticamente
```

### Workflow 4: Sync de Campanhas (Assíncrono)

```
POST /api/campaigns/sync { ad_account_id }
  1. Valida permissão (workspace_id do JWT)
  2. waitUntil(CampaignSyncService.syncAccount(id))  ← @vercel/functions
     (não void — garante processo vivo pós-return)
  3. Retorna 202 Accepted

[background — CampaignSyncService — strategy pattern Meta/Google]
  4. Busca campanhas, ad_sets, ads da API
  5. UPSERT em campaigns, ad_sets, ads
  6. Busca insights (últimos 30 dias)
  7. UPSERT campaign_insights
  8. UPDATE ad_accounts SET last_synced_at = now()

[Browser — polling pós-202]
  - GET /api/ad-accounts/:id a cada 3s (máx 20 tentativas)
  - Detecta last_synced_at atualizado → invalida TanStack Query cache
  - Timeout 60s → "Sync demorou mais que o esperado — tente novamente"
```

### Workflow 5: AI Chat com Gate de Permissão

```
POST /api/ai/chat { message, ad_account_id, context_type }
  1. GATE DE PERMISSÃO (obrigatório):
     SELECT workspace_members WHERE user_id = jwt.sub AND workspace_id = account.workspace_id
     → 403 Forbidden se não encontrado

  2. Busca contexto (lista fechada — ver Seção 7)

  3. Constrói system prompt + chama Anthropic (claude-sonnet-4-6) com streaming
     SLA: < 2-3s primeiro token visível (único modelo, sem dual-model)

  4. Pipe SSE → browser
     { type: 'delta', text: '...' }
     { type: 'done' }

  5. INSERT ai_chat_messages (user + assistant) após stream completo
     vinculado a ai_chat_sessions (Story 7.2 — múltiplas conversas distintas)
```

### Workflow 6: Reenvio Manual de Conversão

```
POST /api/conversions/:id/send
  1. Valida permissão e status do conversion_event original
  2. Busca phone_number_hash da conversa vinculada
  3. Constrói payload Meta:
     { event_id: ORIGINAL_CONVERSION_ID,  ← reutiliza event_id original
       event_name: 'Purchase',
       user_data: { ph: phone_number_hash },
       event_time: now() }
  4. POST Meta Conversions API
  5. INSERT conversion_events {
       is_manual_resend: true,
       original_conversion_id: original.id,
       status: 'sent' | 'failed'
     }

Deduplicação: Meta deduplica por event_id em janela de 7 dias
→ Se envio original chegou (mas retornou erro de rede), Meta não double-conta
→ Se envio original falhou de fato, Meta processa normalmente
```

---

## 9. Database Schema

### Extensions & Helper

```sql
-- UUIDs use gen_random_uuid() (native to PostgreSQL 13+, no extension required).

CREATE OR REPLACE FUNCTION auth_workspace_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::uuid;
$$ LANGUAGE sql STABLE;
```

`auth_workspace_id()` lê a claim `workspace_id` do JWT do usuário autenticado. O JWT não contém essa claim por padrão — ela é injetada pelo `custom_access_token_hook` no momento do login (ver abaixo).

`STABLE` permite que o Postgres faça cache do resultado dentro da mesma query, evitando re-execução por linha avaliada pela RLS.

### Auth Hook — custom_access_token_hook

O `custom_access_token_hook` é uma função PostgreSQL (`SECURITY DEFINER`) invocada pelo Supabase Auth antes de emitir o access token. Ela lê `workspace_members` (bypassa RLS por ser SECURITY DEFINER) e injeta o `workspace_id` do usuário em `user_metadata` do JWT:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claims            jsonb;
  user_workspace_id uuid;
BEGIN
  SELECT wm.workspace_id INTO user_workspace_id
  FROM   workspace_members wm
  WHERE  wm.user_id = (event ->> 'user_id')::uuid
  ORDER BY wm.created_at ASC LIMIT 1;

  claims := event -> 'claims';
  IF user_workspace_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_metadata,workspace_id}', to_jsonb(user_workspace_id::text));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END; $$;

GRANT USAGE  ON SCHEMA public                                    TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
```

#### ⚠️ Passo Manual Obrigatório — Todos os Ambientes

A função SQL é criada via migration (`000002_auth_workspace_id_hook.sql`), mas o **registro do hook no Supabase Auth requer um passo manual no dashboard** (não pode ser feito por migration SQL):

```
Supabase Dashboard
  → Authentication
  → Hooks
  → Custom Access Token
  → Selecionar função: public.custom_access_token_hook
  → Salvar
```

**Este passo é obrigatório em:** ambiente local (`supabase start`), staging e produção.

**Sem este passo:** `auth_workspace_id()` retorna `NULL` → RLS bloqueia todos os acessos → aplicação inteiramente quebrada para todos os usuários. A ausência do hook gera erro explícito (não degradação silenciosa).

**Verificação:** rodar o teste de integração confirma que o hook está ativo:
```bash
pnpm --filter web vitest run src/__tests__/integration/auth-workspace-id.test.ts
```

### DDL Completo

```sql
-- WORKSPACES
CREATE TABLE workspaces (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  plan       text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_self ON workspaces USING (id = auth_workspace_id());

-- WORKSPACE_MEMBERS
CREATE TABLE workspace_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  joined_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON workspace_members USING (workspace_id = auth_workspace_id());

-- CLIENTS
CREATE TABLE clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  document      text,
  contact_email text,
  contact_phone text,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON clients USING (workspace_id = auth_workspace_id());

-- AD_ACCOUNTS (dados operacionais — sem tokens)
CREATE TABLE ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  platform            text NOT NULL CHECK (platform IN ('meta', 'google')),
  external_account_id text NOT NULL,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'disconnected', 'error')),
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_account_id)
);
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON ad_accounts USING (workspace_id = auth_workspace_id());

-- AD_ACCOUNT_CREDENTIALS (service key only — NUNCA exposto ao browser)
CREATE TABLE ad_account_credentials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id            uuid NOT NULL UNIQUE REFERENCES ad_accounts(id) ON DELETE CASCADE,
  access_token_encrypted   text NOT NULL,
  refresh_token_encrypted  text,
  token_expires_at         timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ad_account_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all ON ad_account_credentials USING (false);
-- Acessível apenas via service_role key (bypassa RLS)

-- CAMPAIGNS
CREATE TABLE campaigns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id        uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  platform             text NOT NULL CHECK (platform IN ('meta', 'google')),
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'active',
  objective            text,
  daily_budget         numeric(12,2),
  total_budget         numeric(12,2),
  currency             text NOT NULL DEFAULT 'BRL',
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_campaign_id)
);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON campaigns USING (workspace_id = auth_workspace_id());

-- AD_SETS
CREATE TABLE ad_sets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id        uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  external_ad_set_id text NOT NULL,
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  daily_budget       numeric(12,2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, external_ad_set_id)
);
ALTER TABLE ad_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON ad_sets USING (workspace_id = auth_workspace_id());

-- ADS
CREATE TABLE ads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_set_id      uuid NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  external_ad_id text NOT NULL,
  name           text NOT NULL,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_set_id, external_ad_id)
);
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON ads USING (workspace_id = auth_workspace_id());

-- CAMPAIGN_INSIGHTS
CREATE TABLE campaign_insights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date         date NOT NULL,
  impressions  integer NOT NULL DEFAULT 0,
  clicks       integer NOT NULL DEFAULT 0,
  spend        numeric(12,2) NOT NULL DEFAULT 0,
  reach        integer,
  cpc          numeric(8,4),
  cpm          numeric(8,4),
  roas         numeric(8,4),
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);
ALTER TABLE campaign_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON campaign_insights USING (workspace_id = auth_workspace_id());

-- TRACKED_LINKS
CREATE TABLE tracked_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id   uuid REFERENCES ad_accounts(id) ON DELETE SET NULL,
  campaign_id     uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_set_id       uuid REFERENCES ad_sets(id) ON DELETE SET NULL,
  ad_id           uuid REFERENCES ads(id) ON DELETE SET NULL,
  code            text UNIQUE NOT NULL, -- gerado com crypto.randomBytes (não sequencial)
  destination_url text NOT NULL,
  name            text NOT NULL,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  is_active       boolean NOT NULL DEFAULT true,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON tracked_links USING (workspace_id = auth_workspace_id());

-- TRACKED_CLICKS
CREATE TABLE tracked_clicks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tracked_link_id   uuid NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  phone_number_hash text,      -- preenchido APÓS match (não no clique)
  ip_hash           text,
  user_agent        text,
  gclid             text,
  fbclid            text,
  referrer          text,
  country           text,
  matched_at        timestamptz,
  clicked_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tracked_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON tracked_clicks USING (workspace_id = auth_workspace_id());

-- WHATSAPP_ACCOUNTS
CREATE TABLE whatsapp_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phone_number_display  text NOT NULL,
  session_file_path     text,
  status                text NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected','disconnected','qr_pending','error')),
  lgpd_notice_template  text,
  cb_failure_count      integer NOT NULL DEFAULT 0,   -- circuit breaker (persistido)
  cb_paused_at          timestamptz,                  -- quando definido, circuit está aberto
  last_connected_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON whatsapp_accounts USING (workspace_id = auth_workspace_id());

-- CONVERSATIONS
CREATE TABLE conversations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_account_id       uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  phone_number_hash         text NOT NULL,
  tracked_click_id          uuid REFERENCES tracked_clicks(id) ON DELETE SET NULL,
  platform_source           text CHECK (platform_source IN ('meta','google','organic','unknown')),
  classification_status     text NOT NULL DEFAULT 'pending'
                              CHECK (classification_status IN ('pending','classified','failed','skipped')),
  classification_result     text
                              CHECK (classification_result IN ('lead','converted','not_interested','support')),
  classification_confidence numeric(4,3) CHECK (classification_confidence BETWEEN 0 AND 1),
  classification_reasoning  text,
  classified_at             timestamptz,
  lgpd_notice_sent          boolean NOT NULL DEFAULT false,
  lgpd_notice_sent_at       timestamptz,
  first_message_at          timestamptz NOT NULL,
  last_message_at           timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_account_id, phone_number_hash)
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON conversations USING (workspace_id = auth_workspace_id());

-- CONVERSATION_MESSAGES (LGPD: purga em 90 dias)
CREATE TABLE conversation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content         text NOT NULL,
  message_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON conversation_messages USING (workspace_id = auth_workspace_id());

-- CONVERSATION_CLASSIFICATION_QUEUE
CREATE TABLE conversation_classification_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id       uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','completed','failed')),
  retry_count           integer NOT NULL DEFAULT 0,
  last_error            text,
  enqueued_at           timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  completed_at          timestamptz
);
ALTER TABLE conversation_classification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON conversation_classification_queue
  USING (workspace_id = auth_workspace_id());

-- CONVERSION_EVENTS
CREATE TABLE conversion_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id        uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  platform               text NOT NULL CHECK (platform IN ('meta', 'google')),
  event_name             text NOT NULL DEFAULT 'Purchase',
  sent_at                timestamptz,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','sent','failed','deduplicated')),
  meta_event_id          text,
  error_message          text,
  is_manual_resend       boolean NOT NULL DEFAULT false,
  original_conversion_id uuid REFERENCES conversion_events(id),
  -- Reenvio manual reutiliza id do original como event_id no payload Meta
  -- (Meta deduplica em janela 7d — previne double-count)
  created_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON conversion_events USING (workspace_id = auth_workspace_id());

-- WORKSPACE_SETTINGS (1:1)
CREATE TABLE workspace_settings (
  workspace_id                        uuid PRIMARY KEY
                                        REFERENCES workspaces(id) ON DELETE CASCADE,
  classification_confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.700
                                        CHECK (classification_confidence_threshold BETWEEN 0.500 AND 1.000),
  meta_pixel_id                       text,
  meta_conversions_api_enabled        boolean NOT NULL DEFAULT false,
  google_ads_conversion_action_id     text,
  updated_at                          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON workspace_settings USING (workspace_id = auth_workspace_id());

-- Trigger: auto-cria workspace_settings no INSERT de workspaces
CREATE OR REPLACE FUNCTION create_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_workspace_settings();

-- AI_CHAT_SESSIONS (Story 7.2 — múltiplas conversas distintas por usuário)
CREATE TABLE ai_chat_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id   uuid REFERENCES ad_accounts(id) ON DELETE SET NULL,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON ai_chat_sessions USING (workspace_id = auth_workspace_id());

-- AI_CHAT_MESSAGES
CREATE TABLE ai_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON ai_chat_messages USING (workspace_id = auth_workspace_id());

-- RETENTION_JOBS (auditoria LGPD — sem RLS, acesso interno via service key)
-- Não contém dado pessoal; apenas metadados de execução de job. Decisão consciente.
CREATE TABLE retention_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type         text NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  records_deleted  integer NOT NULL DEFAULT 0,
  status           text NOT NULL CHECK (status IN ('running','completed','failed')),
  error_message    text
);
```

### Índices

```sql
-- LIFO cross-link match (sem filtro de link_id — comportamento cross-link intencional)
CREATE INDEX idx_tracked_clicks_lifo_match
  ON tracked_clicks(workspace_id, clicked_at DESC)
  WHERE matched_at IS NULL;

-- Phone hash lookup pós-match
CREATE INDEX idx_tracked_clicks_phone_hash
  ON tracked_clicks(phone_number_hash, clicked_at DESC);

-- Links ativos (soft delete)
CREATE INDEX idx_tracked_links_active
  ON tracked_links(workspace_id, is_active)
  WHERE deleted_at IS NULL;

-- Dashboard de conversas
CREATE INDEX idx_conversations_workspace_status
  ON conversations(workspace_id, classification_status, first_message_at DESC);

-- Job de purga LGPD
CREATE INDEX idx_conversation_messages_purge
  ON conversation_messages(message_at)
  WHERE message_at IS NOT NULL;

-- Worker de classificação — polling da fila
CREATE INDEX idx_classification_queue_worker
  ON conversation_classification_queue(status, retry_count, enqueued_at)
  WHERE status IN ('pending', 'failed') AND retry_count < 3;

-- Insights por campanha
CREATE INDEX idx_campaign_insights_date
  ON campaign_insights(campaign_id, date DESC);

-- AI chat history
CREATE INDEX idx_ai_chat_sessions_user
  ON ai_chat_sessions(workspace_id, user_id, last_message_at DESC);
```

### Nota: Derivação do Salt HMAC-SHA256

```
workspace_salt = HMAC-SHA256(workspace_id::text, GLOBAL_HMAC_SECRET)
phone_hash     = HMAC-SHA256(normalizePhone(phone), workspace_salt)
ip_hash        = HMAC-SHA256(ip, workspace_salt)
```

- `GLOBAL_HMAC_SECRET` → env var independente por serviço (Vercel, whatsapp-worker, classification-worker)
- Salt nunca armazenado — derivado on-demand em `packages/utils/src/hmac.ts`
- Rotação: `GLOBAL_HMAC_SECRET_V2` → batch re-hash offline de todos os registros → deprecar V1

---

## 10. Estratégia de Sandbox e Testes de Integração

Esta seção define a estratégia oficial de sandbox para as integrações de anúncio do **Epic 2** — **Meta Ads** e **Google Ads**. O objetivo é garantir que nenhum teste, em nenhum ambiente, toque contas de anúncio reais de clientes, e que CI nunca disponha de credenciais de produção. A integração Anthropic (sandbox/mocks de classificação) é tratada no Epic 5 e está fora do escopo desta seção.

> Esta seção complementa a **Seção 7 — External APIs**, que define o toggle `MOCK_EXTERNAL_APIS` por ambiente. Aqui detalhamos o mecanismo concreto de cada sandbox de plataforma e as variáveis de ambiente necessárias para as Stories 2.1–2.4.

> ⚠️ **Chave de criptografia por ambiente:** `TOKEN_ENCRYPTION_KEY` DEVE ser diferente entre
> desenvolvimento, staging e produção. Nunca reutilizar a chave da v1 do Advezo (NFR-7).
> Gerar com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 10.1 Meta Ads Sandbox

**Mecanismo:** **Facebook Developer App** em modo desenvolvimento + **Meta Test Ad Account** — uma conta de anúncios de teste gratuita disponível em qualquer Business Manager. A Test Ad Account aceita o fluxo OAuth completo e expõe a Marketing API sem gastar verba real nem afetar entregas reais.

**Variáveis de ambiente:**

| Variável | Descrição | Restrição |
|----------|-----------|-----------|
| `META_APP_ID` | App ID do Facebook Developer App | — |
| `META_APP_SECRET` | App Secret do Developer App | **NUNCA** em `NEXT_PUBLIC_*` — server-only |
| `META_TEST_AD_ACCOUNT_ID` | ID da conta de teste (formato `act_XXXXXXXXXX`) | Apenas dev/staging |

**Garantia anti-produção (como assegurar que testes nunca tocam contas reais):**
- Verificar `process.env.NODE_ENV !== 'production'` antes de qualquer escrita real via Marketing API em fluxo de teste, **OU**
- Prefixar o `external_account_id` da fixture de teste com `test_` ao popular dados de teste — qualquer conta cujo `external_account_id` não comece com `test_` é, por convenção, uma conta candidata a produção e não deve ser alvo de teste automatizado.

**Nota sobre o modo desenvolvimento:** o Developer App em modo desenvolvimento limita o OAuth a usuários que foram adicionados explicitamente como **testadores** (Testers/Roles) no painel do Meta for Developers. Usuários fora dessa lista recebem erro de autorização — comportamento esperado, não bug.

### 10.2 Google Ads Sandbox

**Mecanismo:** **Google Ads API test account** — uma conta especial criada via Google Ads API Center com `is_test_account: true`. Test accounts não servem anúncios reais e não consomem orçamento, mas expõem a API completa para o fluxo OAuth + sync.

**Developer Token — níveis de acesso (requisito humano PC-03):**
- Em modo teste, o Developer Token opera em nível **"test"** (aprovação automática) — suficiente para conectar e sincronizar contas de teste.
- **Produção requer aprovação manual pela Google**, um processo externo ao sistema com prazo variável. Essa aprovação é uma **ação humana fora do sistema**, documentada como **PC-03** no `EPIC-02-EXECUTION.yaml` (`required_before: wave_2`). A Story 2.2 prossegue em sandbox; a Story 2.4 só vai a produção com o Developer Token de produção aprovado.

**Variáveis de ambiente:**

| Variável | Descrição | Restrição |
|----------|-----------|-----------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | **NUNCA** em `NEXT_PUBLIC_*` — server-only |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer Token (nível test ou produção) | server-only |
| `GOOGLE_ADS_TEST_CUSTOMER_ID` | Customer ID da conta de teste | Apenas dev/staging |

**Refresh token em sandbox:** usar o fluxo OAuth normal. O refresh token **também precisa ser criptografado mesmo em teste** (AES-256-GCM, via `packages/utils/src/crypto.ts`). Razão: manter um único code path entre teste e produção — se o teste pulasse a criptografia, a divergência mascararia bugs de encrypt/decrypt que só apareceriam em produção.

### 10.3 Regra Geral Anti-Produção para CI

- **CI nunca deve ter credenciais de produção Meta/Google.** Os secrets de produção vivem apenas nos dashboards de cada ambiente (Vercel/Railway prod), nunca no GitHub Actions usado por PRs.
- **Variáveis de CI:** somente sandbox credentials ou mocks. Testes unitários usam **MSW** (Mock Service Worker) — sem rede real.
- **Testes de integração que precisam de API real** (sandbox) usam `describe.runIf(hasSandboxCredentials)` — o mesmo padrão do `auth-workspace-id.test.ts` já existente: quando as credenciais de sandbox não estão presentes no ambiente, o bloco é pulado em vez de falhar; quando presentes (staging), roda contra a API de teste real.

```typescript
// Padrão estabelecido — espelha auth-workspace-id.test.ts
const hasSandboxCredentials =
  !!process.env.META_TEST_AD_ACCOUNT_ID && !!process.env.META_APP_SECRET

describe.runIf(hasSandboxCredentials)('Meta OAuth — integração sandbox', () => {
  // roda apenas com credenciais de Test Ad Account presentes (staging)
})
```

> **Distinção importante:** `SKIP` por ausência de credenciais é aceitável em CI de PR (unit-only). NÃO é aceitável como resultado de gate para staging/produção das Waves 1 e 2 — lá os testes de integração contra sandbox são obrigatórios (consistente com o gate de deploy da Seção 14 — Development Workflow).

### 10.4 Resumo por Ambiente

| Ambiente | Meta | Google | Credenciais |
|----------|------|--------|-------------|
| local (dev) | `MOCK_EXTERNAL_APIS=true` | `MOCK_EXTERNAL_APIS=true` | Nenhuma real necessária |
| CI (PR) | Mocks (MSW) | Mocks (MSW) | Nenhuma — `runIf` pula integração |
| staging | Meta Test Ad Account | Google test customer (`is_test_account`) | Sandbox apenas |
| production | Contas reais dos clientes | Contas reais (Developer Token aprovado — PC-03) | Produção, distintas de dev (NFR-7) |

---

## 11. Frontend Architecture

### Estrutura de Rotas

```
apps/web/src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── invite/[token]/page.tsx
├── (onboarding)/                    ← Story 1.2 — usuário autenticado sem workspace
│   └── onboarding/page.tsx
├── (dashboard)/
│   ├── layout.tsx                   ← Sidebar + Header + workspace selector
│   ├── page.tsx                     ← Dashboard overview (Story 1.6)
│   ├── campaigns/
│   ├── tracking/
│   ├── whatsapp/
│   ├── conversations/
│   ├── conversions/
│   ├── assistant/                   ← AI Chat com painel de sessões (Story 7.2)
│   └── settings/
│       ├── workspace/
│       ├── members/
│       ├── ad-accounts/
│       └── integrations/
└── t/[code]/
    └── route.ts                     ← Edge Function (export const runtime = 'edge')
```

### Server vs Client Components

| Componente | Tipo | Motivo |
|-----------|------|--------|
| Páginas de listagem | **Server** | Fetch inicial no servidor |
| Layout com sidebar | **Server** | Estrutura estática |
| Formulários | **Client** | React Hook Form + interatividade |
| Gráficos Recharts | **Client** | Requer DOM do browser |
| AI Chat stream | **Client** | SSE via ReadableStream |
| Tabela de campanhas com ações inline | **Client** | Mutations com feedback visual (TanStack Query) |
| QR Code WhatsApp | **Client** | Polling ativo |

**Regra:** página default é Server Component; adiciona `'use client'` apenas quando há estado local, event handlers ou APIs do browser.

### Estado

```
Zustand: activeWorkspace, activeAdAccount, sidebarOpen
TanStack Query v5: todos os dados de servidor (cache + invalidação + hydration)
```

**Hydration pattern:**
```typescript
// Server Component (page.tsx)
await queryClient.prefetchQuery({ queryKey: ['campaigns', workspaceId], queryFn: ... });
return <HydrationBoundary state={dehydrate(queryClient)}>
  <CampaignsTable />
</HydrationBoundary>
```

**Query key convention:**
```typescript
['campaigns', workspaceId]              // listagem
['campaigns', workspaceId, campaignId]  // detalhe
['insights', campaignId, dateRange]     // insights
```

---

## 12. Backend Architecture

### Supabase Client Factory — 3 Modos

```typescript
// packages/database/src/client.ts

// 1. BROWSER — anon key + JWT automático, RLS ativa
export function createBrowserClient() { ... }

// 2. SERVER (API Routes) — anon key + JWT do request, RLS ativa
export function createServerClient(req: NextRequest) { ... }

// 3. SERVICE (Railway workers) — service_role key, RLS bypassada
//    Worker filtra workspace_id explicitamente em TODA query
export function createServiceClient() { ... }
```

### Anatomia de API Route

```typescript
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. AUTH
  const { session, workspaceId } = await requireAuth(req);
  if (!session) return errorResponse(401, 'UNAUTHORIZED');

  // 2. VALIDATION (Zod)
  const body = Schema.safeParse(await req.json());
  if (!body.success) return errorResponse(400, 'VALIDATION_ERROR', body.error);

  // 3. PERMISSION (além do RLS)
  const account = await getAdAccount(supabase, body.data.adAccountId);
  if (!account || account.workspace_id !== workspaceId)
    return errorResponse(403, 'FORBIDDEN');

  // 4. ASYNC EXECUTION
  waitUntil(service.execute(body.data).catch(
    (err) => { logger.error({ err }, 'failed'); Sentry.captureException(err); }
  ));

  // 5. RESPONSE
  return NextResponse.json({ data: result }, { status: 202 });
}
```

### CampaignSyncService — Strategy Pattern

```typescript
interface SyncStrategy {
  fetchCampaigns(accountId: string): Promise<RawCampaign[]>;
  fetchAdSets(campaignId: string): Promise<RawAdSet[]>;
  fetchAds(adSetId: string): Promise<RawAd[]>;
  fetchInsights(campaignId: string, dateRange: DateRange): Promise<RawInsights[]>;
}

class MetaSyncStrategy implements SyncStrategy { ... }
class GoogleAdsSyncStrategy implements SyncStrategy { ... }

// Seleção por platform — sem branching espalhado pelo código
const strategy = account.platform === 'meta'
  ? new MetaSyncStrategy(account)
  : new GoogleAdsSyncStrategy(account);
```

### normalizePhone — Contrato Único (packages/utils/src/phone.ts)

```typescript
export function normalizePhone(phone: string): string {
  // 1. Remove todos os não-dígitos
  let digits = phone.replace(/\D/g, '');

  // 2. Se começa com 55 (Brasil), verifica formato
  if (digits.startsWith('55')) {
    digits = digits.slice(2); // remove prefixo
  }

  // 3. DDD (2 dígitos) + número
  if (digits.length === 10) {
    // Formato antigo sem o 9: (DDD)(8 dígitos) → adiciona 9 após DDD
    digits = digits.slice(0, 2) + '9' + digits.slice(2);
  }
  // digits.length === 11: (DDD)(9)(8 dígitos) — formato correto

  return '55' + digits; // resultado: 13 dígitos E.164 sem '+'
}
```

**Regra de ouro:** esta função é a **única** implementação de normalização no monorepo. Qualquer ponto que gera ou compara `phone_number_hash` usa esta função. Divergência = hashes nunca dão match.

### Edge Function — Service Key

```typescript
// apps/web/src/app/t/[code]/route.ts
export const runtime = 'edge';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  // Service key — Edge Function roda no servidor Vercel, nunca no browser
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from('tracked_links')
    .select('destination_url, workspace_id, id')
    .eq('code', params.code)
    .eq('is_active', true)
    .single();

  if (!link) return NextResponse.redirect(new URL('/not-found', req.url));

  const click = buildClickRecord(req, link);

  ctx.waitUntil(
    supabase.from('tracked_clicks').insert(click).then(({ error }) => {
      if (error) {
        logger.error({ error, code: params.code }, 'tracked_click insert failed');
        Sentry.captureException(error);
      }
    })
  );

  return NextResponse.redirect(link.destination_url, { status: 302 });
}
```

---

## 13. Unified Project Structure

```
advezo-v2/
├── apps/
│   ├── web/                            ← Vercel
│   │   ├── src/
│   │   │   ├── app/                    ← App Router (ver Seção 10)
│   │   │   ├── components/
│   │   │   │   ├── ui/                 ← ShadCN/ui (gerado)
│   │   │   │   ├── layout/
│   │   │   │   └── shared/
│   │   │   ├── hooks/
│   │   │   ├── stores/                 ← Zustand
│   │   │   ├── services/               ← fetch wrappers para /api/*
│   │   │   └── lib/
│   │   ├── public/
│   │   ├── next.config.ts              ← CSP headers configurados aqui
│   │   ├── tailwind.config.ts
│   │   ├── components.json             ← ShadCN config
│   │   └── tsconfig.json
│   │
│   ├── whatsapp-worker/                ← Railway Service 1 (Nixpacks)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── baileys-client.ts
│   │       ├── message-handler.ts
│   │       ├── click-matching.ts       ← ClickMatchingService (LIFO cross-link)
│   │       ├── circuit-breaker.ts      ← persiste estado em whatsapp_accounts
│   │       └── lgpd-notice.ts
│   │
│   └── classification-worker/          ← Railway Service 2 (Nixpacks)
│       └── src/
│           ├── index.ts
│           ├── classification-job.ts
│           ├── retention-job.ts        ← purge 90d + alerta crítico compliance
│           ├── anthropic-client.ts
│           └── conversion-sender.ts
│
├── packages/
│   ├── database/       Supabase client factory + tipos gerados (supabase gen types)
│   ├── external-apis/  Clientes tipados + strategy pattern sync
│   ├── mocks/          MockMetaClient, MockGoogleAdsClient, MockAnthropicClient
│   ├── types/          Tipos TypeScript + Zod schemas compartilhados
│   ├── utils/          hmac.ts, phone.ts, date.ts, pagination.ts, api.ts, logger.ts
│   └── test-utils/     createTestWorkspace(), createTestCampaign(), etc.
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260624000001_initial_schema.sql
│   │   └── 20260624000001_initial_schema_rollback.sql  ← rollback obrigatório
│   ├── seed.sql
│   └── config.toml
│
├── tests/
│   └── e2e/                            ← Playwright (testes cross-app)
│
├── docs/
│   ├── prd.md
│   ├── architecture.md                 ← Este documento
│   ├── stories/
│   └── legal/
│       ├── bases-legais.md             ← LGPD Art. 7º IX + teste de proporcionalidade
│       └── subprocessors.md            ← Anthropic + Meta como subprocessadores
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

> **Turborepo:** rejeitado para Beta v2. pnpm workspaces é suficiente para 3 apps + 6 packages. Adicionar apenas se builds começarem a justificar cache distribuído.

---

## 14. Development Workflow

### Branch Strategy

```
main ← produção
├── feat/1.1-project-setup
├── feat/2.3-campaign-sync
├── fix/4.3-gclid-extraction
└── chore/update-supabase-types
```

- Branch por story: `{tipo}/{story-id}-{slug}`
- Merges diretos em `main` bloqueados — PR + 1 aprovação obrigatórios

### Commits (Conventional Commits)

```bash
feat: add tracked link generation with code [Story 4.2]
fix: normalize phone before HMAC to prevent match failure [Story 4.4]
chore: regenerate supabase types after migration
```

### Setup Local

```bash
git clone ... && cd advezo-v2
pnpm install
cp .env.example apps/web/.env.local
cp .env.example apps/whatsapp-worker/.env
cp .env.example apps/classification-worker/.env
supabase start
supabase db push
supabase gen types typescript --local > packages/database/src/types.ts
pnpm --filter web dev
```

#### ⚠️ Passo Manual Obrigatório Pós-`supabase db push`

Após aplicar as migrations, o hook de autenticação deve ser ativado manualmente no Supabase Studio (interface local em `http://localhost:54323`):

```
Supabase Studio (local)
  → Authentication
  → Hooks
  → Custom Access Token
  → Selecionar função: public.custom_access_token_hook
  → Salvar
```

**Por que não é automático:** O Supabase Auth Hook é uma configuração do servidor de autenticação, não do banco de dados — não existe SQL que o ative. A migration cria a função; o dashboard registra o hook no Auth.

**Verificação imediata após o passo:**
```bash
pnpm --filter web vitest run src/__tests__/integration/auth-workspace-id.test.ts
```
Se o teste passar: hook ativo, RLS funcionando. Se falhar com `[HOOK NÃO ATIVO]`: repetir o passo manual.

> Este mesmo passo se aplica a **staging** e **produção** nos respectivos dashboards Supabase de cada ambiente.

#### Gate de Deploy — Testes de Integração Obrigatórios

Os testes em `src/__tests__/integration/` testam comportamento real contra Supabase (RLS, auth hook, isolamento multi-tenant). Eles são **gate não-negociável** antes de qualquer deploy que altere migrations, RLS ou configuração de auth.

**Por que não são cobertos pelo CI padrão (unit tests):** requerem `SUPABASE_SERVICE_ROLE_KEY` e URL real do ambiente alvo — credenciais que não ficam em CI sem configuração explícita.

**Processo atual (pré-CI/CD configurado):**

| Ambiente | Responsável | Quando rodar |
|----------|-------------|--------------|
| Local | @dev | Após `supabase db push` + hook ativado |
| Staging | Quem faz o deploy | Antes de liberar para QA — com vars do ambiente staging |
| Produção | @devops | Obrigatório antes de qualquer release com mudança de migration ou RLS |

```bash
# Rodar com credenciais do ambiente alvo
NEXT_PUBLIC_SUPABASE_URL=<url-do-ambiente> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
pnpm --filter web vitest run src/__tests__/integration/auth-workspace-id.test.ts
```

**Critério de bloqueio:** qualquer `FAIL` nos testes de integração bloqueia o deploy. `SKIP` (sem credenciais) não é aceito como resultado válido para staging/prod.

**Quando CI/CD tiver os secrets configurados** (GitHub Actions + Supabase secrets): mover para job `integration` que roda automaticamente em PRs para `main` — elimina o passo manual.

### Migrations — Rollback Obrigatório

```
supabase/migrations/
├── 20260701_add_feature.sql
├── 20260701_add_feature_rollback.sql   ← obrigatório
│
└── [quando NÃO é reversível]
    20260715_drop_column.sql
    # ⚠️ NOTA NO TOPO: Esta migration NÃO é reversível.
    # Backup manual da coluna 'X' obrigatório antes de aplicar.
```

### Variáveis por Serviço Railway

**`whatsapp-worker`:**
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GLOBAL_HMAC_SECRET,
SENTRY_DSN, NODE_ENV, MOCK_EXTERNAL_APIS, LOG_LEVEL
```

**`classification-worker`:**
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GLOBAL_HMAC_SECRET,
ANTHROPIC_API_KEY, TOKEN_ENCRYPTION_KEY,
SENTRY_DSN, NODE_ENV, MOCK_EXTERNAL_APIS, LOG_LEVEL
```

> `GLOBAL_HMAC_SECRET` deve ser **idêntico** entre os dois serviços do mesmo ambiente.

### CI Pipeline (.github/workflows/ci.yml)

```yaml
steps:
  # 1. SECRET LEAK CHECK
  - name: Check for exposed secrets
    run: |
      if grep -r "NEXT_PUBLIC_.*SERVICE_ROLE\|NEXT_PUBLIC_.*SECRET" \
        --include="*.env*" --include="*.config.*" .; then
        echo "ERRO: variável sensível com NEXT_PUBLIC_"
        exit 1
      fi

  # 2. LINT (inclui: sem console.log fora de testes)
  - run: pnpm lint

  # 3. TYPECHECK
  - run: pnpm typecheck

  # 4. SUPABASE + TESTES
  - run: supabase start
  - run: pnpm test --run --coverage
    env:
      GLOBAL_HMAC_SECRET: test-secret-for-ci

  # 5. COVERAGE GATE (utils: 100%)
  - run: pnpm --filter @advezo/utils test --coverage --coverage.thresholds.lines=100

  # 6. SUPABASE GEN TYPES CHECK
  - run: |
      supabase gen types typescript --local > /tmp/types-check.ts
      diff packages/database/src/types.ts /tmp/types-check.ts || \
        (echo "types.ts desatualizado — rode supabase gen types" && exit 1)

  # 7. BUILD
  - run: pnpm --filter web build
```

---

## 15. Deployment Architecture

### Pipeline Completo

```
PR aberto → CI (lint + typecheck + test + secret-check + gen-types-check)
          → Vercel Preview Deploy automático
          → Review + aprovação
          → Merge em main
              ├── VERCEL PRODUÇÃO (automático — já passou por preview + approval)
              ├── RAILWAY STAGING (automático — whatsapp-worker + classification-worker)
              │     Dev valida manualmente em staging (WA test number, conversão de teste)
              └── RAILWAY PRODUÇÃO (manual — botão "Deploy to Production" no Dashboard)
                    Gate obrigatório: workers tocam sessão WA ativa + APIs reais
```

### Supabase

- **2 projetos:** `advezo-dev` (staging) e `advezo-prod` (produção)
- **Plano:** Free durante Epics 1-3 (sem dado real de terceiro). Upgrade para **Pro (~$25/mês)** antes de processar dado real de leads em produção — PITR está disponível no Pro, não requer Team plan. Team plan ($599/mês) excluído do escopo: SSO/SOC2/HIPAA não se aplicam a este caso de uso.
- **Migrations:** aplicadas manualmente (`supabase db push`) — não automáticas no CI/CD
- **Storage buckets:** `sessions` (Baileys, privado) + `imports` (CSV, privado com RLS)

### Sizing Railway

| Serviço | RAM | CPU | Réplicas |
|---------|-----|-----|----------|
| `whatsapp-worker` | 512 MB (monitorar — alerta em 70%) | 0.5 vCPU | 1 (WA é stateful) |
| `classification-worker` | 256 MB | 0.5 vCPU | 1 |

> Réplica única para whatsapp-worker é intencional — múltiplas instâncias criam conflito de sessão Baileys.

### Domínios

| Domínio | Plataforma | Propósito |
|---------|-----------|-----------|
| `app.advezo.com.br` | Vercel | Aplicação principal + links `/t/*` (mesmo domínio) |
| `*.vercel.app` | Vercel | Preview deploys por PR |

### Rollback de Deploy Railway (código)

```
Railway Dashboard → Service → Deployments
→ Selecionar deploy anterior → "Rollback to this deployment"
(Railway mantém histórico de deploys — reversão instantânea)
Gate manual existia exatamente para minimizar necessidade desse fluxo.
```

### Heartbeat — UptimeRobot (3 monitores, free tier)

```
Monitor 1: GET app.advezo.com.br/api/internal/health      (Next.js + Supabase)
Monitor 2: GET {RAILWAY_WPP_URL}/health                   (Baileys + DB)
Monitor 3: GET {RAILWAY_CLASS_URL}/health                  (DB + queue)

Frequência: 5 min — alerta após 2 falhas consecutivas
Canal: email + webhook WhatsApp para ops
```

### Cron de Sync de Campanhas Meta (Story 2.3)

Sincronização diária de campanhas e métricas Meta Ads via cron Railway.

```
Schedule:  0 6 * * *          (06:00 UTC diário)
Método:    POST https://<app-url>/api/sync/meta
Header:    x-cron-secret: $CRON_SECRET   (401 se ausente/diferente)
Resposta:  { synced: N, errors: M, accounts: [...] }
```

Configuração em `railway.json` (raiz do repositório):

```json
{
  "cron": [
    {
      "command": "curl -X POST $APP_URL/api/sync/meta -H \"x-cron-secret: $CRON_SECRET\"",
      "schedule": "0 6 * * *"
    }
  ]
}
```

O endpoint itera todas as `ad_accounts` com `platform='meta'` e `status='active'`,
chamando `syncMetaAccount(adAccountId, workspaceId)` para cada uma. Falhas
individuais não abortam o lote — cada erro é gravado em `sync_errors` e reflete no
`status` da conta (`expired` para token #190, `error` para os demais), nunca de
forma silenciosa (NFR-4).

> **Variável `CRON_SECRET`** (mín. 32 chars, distinta por ambiente — NFR-7) deve
> estar configurada tanto no serviço da aplicação quanto no job de cron do Railway.

---

## 16. Security & Performance

### Proteção de Dados

```typescript
// packages/utils/src/hmac.ts
export function deriveWorkspaceSalt(workspaceId: string): string {
  return createHmac('sha256', process.env.GLOBAL_HMAC_SECRET!)
    .update(workspaceId).digest('hex');
}

export function hashPhone(phone: string, workspaceId: string): string {
  const salt = deriveWorkspaceSalt(workspaceId);
  return createHmac('sha256', salt).update(normalizePhone(phone)).digest('hex');
}
```

**Tokens de ad accounts:** **AES-256-GCM** no nível da aplicação antes do INSERT (NFR-1), via `encryptToken`/`decryptToken` em `packages/utils/src/crypto.ts`; chave em `TOKEN_ENCRYPTION_KEY` (32 bytes / 64 hex chars), distinta por ambiente (NFR-7) e nunca em `NEXT_PUBLIC_*`; tokens nunca retornados em API responses. O formato persistido é `<iv_hex>:<authTag_hex>:<ciphertext_hex>` — o auth tag GCM garante integridade (detecta adulteração no decrypt).

**Códigos de link rastreável:** `crypto.randomBytes(8).toString('base64url')` — criptograficamente aleatório, espaço amostral inviável para enumeração/brute-force.

### OWASP Top 10

| Risco | Mitigação |
|-------|-----------|
| A01 Broken Access Control | RLS em todas as tabelas; gate duplo no AI Chat |
| A02 Cryptographic Failures | HMAC-SHA256; AES-256; TLS em todos os canais |
| A03 Injection | Supabase SDK parameterized; Zod valida todo input |
| A05 Security Misconfiguration | CI bloqueia `NEXT_PUBLIC_*SECRET*` automaticamente |
| A07 Auth Failures | Supabase Auth; middleware.ts protege todas as rotas |

### CSP Headers (next.config.ts)

```typescript
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-eval' ..." },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];
```

### LGPD — Conformidade Técnica (NFR-8)

| Requisito | Implementação |
|-----------|--------------|
| Base legal | Art. 7º, IX LGPD (legítimo interesse) — `docs/legal/bases-legais.md` com teste de proporcionalidade |
| Aviso ao titular | Template configurável enviado na primeira mensagem (lgpd_notice_template) |
| Retenção | Hard DELETE após 90 dias via job diário com retry e alerta crítico |
| Subprocessadores | Anthropic + Meta documentados em `docs/legal/subprocessors.md` |
| Art. 18 (exclusão) | Lead solicita ao gestor → gestor abre ticket no Advezo → Advezo executa DELETE em 15 dias |
| Pseudonimização | phone_number_hash substitui número real em todas as tabelas |

### Rate Limiting

- `/api/campaigns/sync`: 1 req/conta/minuto (verifica `last_synced_at` antes de disparar)
- `GET /t/[code]`: rate limit leve por IP via Vercel Edge KV (anti fraude de clique)

### Rotação do HMAC Secret

`GLOBAL_HMAC_SECRET_V2` introduzido como nova env var → batch re-hash offline de todos os registros existentes (query em lotes de 1000 para não travar DB) → `V2` vira o secret ativo → `V1` deprecado. Executável sem downtime do rastreamento.

---

## 17. Testing Strategy

### Pirâmide

```
E2E (Playwright — tests/e2e/)         ← fluxos críticos cross-app
Integration (Vitest + Supabase local) ← API Routes, RLS, jobs
Unit (Vitest + RTL)                   ← utils, services, componentes
```

### Testes Obrigatórios

```typescript
// packages/utils/src/__tests__/phone.test.ts
describe('normalizePhone', () => {
  it('número sem 9 (10 dígitos) = número com 9 (11 dígitos)', () => {
    expect(normalizePhone('1199999999')).toBe(normalizePhone('11999999999'));
  });
  it('remove +55 duplicado', ...);
  it('remove caracteres não-numéricos', ...);
});

// Integração: RLS isolation
it('workspace B não lê campanhas do workspace A', async () => {
  const clientB = createServerClientWithJWT(workspaceBToken);
  const { data } = await clientB.from('campaigns').select('*')
    .eq('workspace_id', workspaceA.id);
  expect(data).toHaveLength(0);
});

// Integração: LGPD retention (banco real — auditável)
it('deleta mensagens > 90 dias, preserva recentes', async () => {
  await insertMessage({ message_at: daysAgo(91) });
  await insertMessage({ message_at: daysAgo(89) });
  await runRetentionCleanupJob();
  expect(await countMessages()).toBe(1);
});

// E2E: rate limit da Edge Function
it('múltiplos cliques rápidos do mesmo IP são throttlados', async () => {
  for (let i = 0; i < 20; i++) await fetch('/t/test-code', { headers: { 'X-Forwarded-For': '1.2.3.4' } });
  const lastResponse = await fetch('/t/test-code', { headers: { 'X-Forwarded-For': '1.2.3.4' } });
  expect(lastResponse.status).toBe(429);
});
```

### CI Integration

```yaml
- run: supabase start  # mesma ferramenta do dev local — consistência
- run: pnpm test --run --coverage
- run: pnpm --filter @advezo/utils test --coverage --coverage.thresholds.lines=100
```

### Thresholds

| Camada | Target |
|--------|--------|
| `packages/utils` | **100%** — crypto é crítico |
| `packages/external-apis` | 80%+ |
| API Routes (integração) | happy path + 401/403 |
| Workers | classification-job + retention-job obrigatórios |

### packages/test-utils

```typescript
// Factories reutilizáveis entre integration tests e E2E
export async function createTestWorkspace(db: SupabaseClient) { ... }
export async function createTestAdAccount(db: SupabaseClient, workspaceId: string) { ... }
export async function createTestCampaign(db: SupabaseClient, adAccountId: string) { ... }
export async function createTestConversation(db: SupabaseClient, opts: ConversationOpts) { ... }
```

---

## 18. Coding Standards

### TypeScript

```typescript
// strict mode obrigatório — sem exceções
// unknown em vez de any — força type narrowing
// Tipos explícitos em funções públicas de packages
export function hashPhone(phone: string, workspaceId: string): string { ... }
```

### Nomenclatura

| Contexto | Convenção |
|---------|-----------|
| Arquivos | `kebab-case.ts(x)` |
| Componentes React | `PascalCase` |
| Funções e variáveis | `camelCase` |
| Constantes | `SCREAMING_SNAKE` |
| Zod schemas | `PascalCase + Schema` |

### Imports — Absolutos Obrigatórios (Art. VI AIOX)

```typescript
// ✅ CORRETO
import { hashPhone } from '@advezo/utils';
import { CampaignTable } from '@/components/campaigns/campaign-table';

// ❌ PROIBIDO
import { hashPhone } from '../../../packages/utils/src/hmac';
```

### Comentários

Default: nenhum. Apenas quando o WHY é não-óbvio:

```typescript
// ✅ Válido — restrição oculta com impacto real
// LIFO sem filtro por link_id — comportamento cross-link intencional (Story 4.4)
// Filtrar por link_id quebraria rastreamento de links compartilhados via diferentes assets

// ❌ Inútil — o código já diz isso
// Busca o primeiro clique não-matcheado por data
```

### Server Actions vs API Routes

- **Server Actions:** mutations de UI sem integração externa (criar cliente, toggle de configuração)
- **API Routes:** integrações externas (Meta/Google/Anthropic), chamadas de workers, respostas 202

### ESLint Rules

```javascript
// Lint falha no build se detectar:
// 1. console.log fora de arquivos de teste
'no-console': ['error'],  // override em *.test.ts: 'off'

// 2. Imports relativos além de um nível
'no-restricted-imports': ['error', { patterns: ['../../*'] }]
```

### Extensão de Testes

`.test.ts` — não misturar com `.spec.ts` no mesmo projeto.

### Barrel Files

Evitar `index.ts` de re-export em packages — problemas de tree-shaking e import circular sutil em monorepo.

---

## 19. Error Handling

### AppError — Classe Compartilhada

```typescript
// packages/types/src/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Exemplos de uso
throw new AppError('AD_ACCOUNT_DISCONNECTED', 'Meta token expired');
throw new AppError('FORBIDDEN', 'Account does not belong to this workspace');
```

### withRetry — Backoff por Cliente

```typescript
// Cada cliente externo tem isAuthError() e isRateLimitError() próprios
// normalizados para formato comum antes do withRetry genérico
export async function withRetry<T>(fn: () => Promise<T>, opts = { maxRetries: 3 }): Promise<T> {
  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (isAuthError(err)) throw err;           // sem retry
      if (isRateLimitError(err)) {
        await sleep(1000 * 2 ** attempt + jitter());
        continue;
      }
      if (attempt === opts.maxRetries - 1) {
        Sentry.captureException(err);
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}
```

### Workers — Erros Isolados por Item

```typescript
// Erro num item não mata o batch (Promise.allSettled)
const results = await Promise.allSettled(items.map(classifyConversation));
results.forEach((result, i) => {
  if (result.status === 'rejected') {
    logger.error({ err: result.reason, itemId: items[i].id }, 'item failed');
    Sentry.captureException(result.reason);
  }
});

// process.exit(1) apenas para erros de integridade do processo
// (falha de banco, memória esgotada) — NÃO para erros de item isolado
process.on('unhandledRejection', (reason) => {
  if (isProcessIntegrityError(reason)) {
    logger.fatal({ reason }, 'process integrity error — restarting');
    Sentry.captureException(reason);
    process.exit(1); // Railway reinicia automaticamente
  }
  // erros de item: logar sem exit
  logger.error({ reason }, 'unhandled rejection (non-fatal)');
  Sentry.captureException(reason);
});
```

### RetentionCleanupJob — Alerta de Compliance

```typescript
async function runRetentionCleanupJob() {
  try {
    const { count } = await deleteOldMessages();
    await markJobCompleted(jobRecord.id, count);
  } catch (err) {
    await markJobFailed(jobRecord.id, err.message);
    Sentry.captureException(err, { level: 'fatal', tags: { type: 'lgpd_compliance' } });
    await sendHighPriorityAlert('RetentionCleanupJob falhou — risco de retenção além de 90 dias');
    // NÃO lança — próximo ciclo do cron tenta automaticamente (a cada 5 min)
  }
}
```

### AsyncLocalStorage — requestId Correlacionado

```typescript
// packages/utils/src/logger.ts
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export const logger = pino({
  mixin() { return requestContext.getStore() ?? {}; },
  redact: ['*.accessToken', '*.phoneNumber', '*.ip', '*.authorization'],
});
```

### Mensagens ao Usuário

| Código | Mensagem exibida |
|--------|-----------------|
| `AD_ACCOUNT_DISCONNECTED` | "Sua conta Meta expirou. Reconecte em Configurações." |
| `RATE_LIMITED` | "Muitas requisições. Tente em alguns minutos." |
| `SYNC_TIMEOUT` | "Sincronização demorou mais que o esperado. Tente novamente." |
| `INTERNAL_ERROR` | "Erro inesperado. Nossa equipe foi notificada." |

> Nunca expor stack traces, IDs internos de infraestrutura ou detalhes técnicos ao usuário.

---

## 20. Monitoring & Observability

### Matriz

| O que observar | Ferramenta |
|---------------|-----------|
| Exceções JavaScript | Sentry (Next.js SDK + workers) |
| Performance de API Routes | Sentry Performance (tracesSampleRate: 10% em prod) |
| Core Web Vitals | Vercel Analytics |
| CPU / RAM / restarts | Railway Metrics nativos |
| Worker vivo/morto | UptimeRobot (3 monitores, free tier) |
| Memória whatsapp-worker | Railway Metrics — alerta em 70% do limite |
| Worker vivo mas congelado | Queue depth alert (>50 itens por >30 min) |

### Sentry

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // Remove PII antes de enviar
    delete event.request?.headers?.['authorization'];
    delete event.request?.headers?.['cookie'];
    return event;
  },
});
```

### Heartbeat — UptimeRobot

```
Monitor 1: GET app.advezo.com.br/api/internal/health
Monitor 2: GET {RAILWAY_WPP_URL}/health
Monitor 3: GET {RAILWAY_CLASS_URL}/health

Frequência: 5 min — alerta após 2 falhas consecutivas
Canal: email + webhook WhatsApp para ops
```

**Health check — classification-worker:**
```typescript
app.get('/health', async (req, res) => {
  const dbOk = await pingDatabase();
  const queueDepth = await getQueueDepth();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', queueDepth });
});
```

**Queue depth alert:** quando `queueDepth > 50 por > 30 min` → alerta distinto (worker vivo mas congelado processando item que nunca retorna).

### Logging com Proteção PII

```typescript
// redact por nome de campo — configuração estática
export const logger = pino({
  redact: ['*.accessToken', '*.phoneNumber', '*.ip', '*.authorization'],
});

// Teste automatizado obrigatório:
// 1. Loga objetos com variações de nome de campo sensível
//    → confirma que nenhum valor em claro aparece no output
// 2. Lint/regex no CI que sinaliza se string E.164 aparece
//    em chamadas logger.* no código-fonte
```

### Alertas por Severidade

| Evento | Severidade | Canal |
|--------|-----------|-------|
| Worker não responde ao heartbeat | 🔴 CRÍTICO | WhatsApp ops + email |
| RetentionCleanupJob falhou | 🔴 CRÍTICO (compliance) | WhatsApp ops + Sentry fatal |
| Circuit breaker Baileys ativado | 🟠 ALTO | Dashboard UI + Sentry |
| RAM whatsapp-worker > 70% | 🟡 MÉDIO | Railway notification |
| Queue depth > 50 por > 30 min | 🟡 MÉDIO | WhatsApp ops |
| Meta token expirará em 7 dias | 🟢 BAIXO | Dashboard UI banner |

---

## 21. Checklist Results

### 5 Prioridades de Investigação — Resolvidas

| # | Questão | Status |
|---|---------|--------|
| 1 | Sandbox/mock para APIs externas | ✅ `MOCK_EXTERNAL_APIS` + factory + MSW + staging com contas de teste |
| 2 | SLAs de performance | ✅ < 300ms redirect, < 2-3s AI chat, < 30/60s sync documentados |
| 3 | HMAC-SHA256 salt management | ✅ Derivação determinística, rotação V2 planejada, `normalizePhone` único |
| 4 | Estratégia de observabilidade | ✅ Sentry + Vercel Analytics + Railway + UptimeRobot + alertas por severidade |
| 5 | NFR-8 LGPD 90 dias | ✅ Job diário com retry, alerta crítico, `retention_jobs` auditável, subprocessadores documentados |

### NFRs — Conformidade

| NFR | Status |
|-----|--------|
| NFR-1 Multi-tenant com isolamento real | ✅ RLS em todas as tabelas + service key com filtro explícito |
| NFR-2 Tokens não expostos no browser | ✅ `ad_account_credentials` deny_all + service key exclusivo |
| NFR-3 WhatsApp estável (Baileys) | ✅ Sem Chromium; sessão em Storage; circuit breaker persistido em DB |
| NFR-4 Redirect rastreável < 300ms | ✅ Edge Function + waitUntil() não-bloqueante |
| NFR-5 Deduplicação de conversões | ✅ event_id original reutilizado; Meta deduplica em 7d |
| NFR-6 AI Chat com dados reais | ✅ Gate de permissão duplo + lista fechada de campos |
| NFR-7 Exportação CSV Google Ads | ✅ GCLID capturado na Edge Function + endpoint CSV |
| NFR-8 LGPD retenção 90 dias | ✅ Job + retry + alerta crítico + subprocessadores |

### Checklist Arquitetural

```
✅ Separação de responsabilidades clara (Vercel / Supabase / Railway)
✅ Isolamento multi-tenant em todas as camadas
✅ Sem features inventadas — cada decisão rastreável a story ou NFR
✅ Soluções simples preferidas (sem Redis, sem pg_notify, sem Turborepo)
✅ Segurança por design: CSP, HMAC-SHA256, AES-256-GCM, deny_all em credentials
✅ LGPD compliant: pseudonimização, retenção, base legal Art. 7º IX, subprocessadores
✅ Sandbox strategy completa: dev nunca chama APIs reais acidentalmente
✅ Testing strategy com 100% em modules de crypto e compliance LGPD
✅ Error handling diferenciado por tipo e camada
✅ Observabilidade em 4 camadas: exceções, performance, infra, uptime
✅ Deploy pipeline com gates (preview + staging antes de Railway prod)
✅ Rollback documentado para migrations e deploys
```

### Decisões Abertas — Pendentes Antes do Lançamento

| Item | Bloqueante para |
|------|----------------|
| ⚠️ Upgrade para Supabase Pro (~$25/mês) com PITR habilitado | Antes de processar dado real de leads em produção |
| ⚠️ Número WhatsApp de teste para dev/staging | Epic 3 em staging |
| ⚠️ Meta Test Ad Account no Business Manager | Epic 2 em staging |
| ⚠️ Google Ads test customer ID | Epic 2 em staging |
| ⚠️ Domínio `app.advezo.com.br` no Vercel | Lançamento Beta |
| ⚠️ UptimeRobot — configurar 3 monitores | Observabilidade prod |
| ⚠️ `docs/legal/bases-legais.md` com teste de proporcionalidade | LGPD compliance |
| ⚠️ `docs/legal/subprocessors.md` (Anthropic + Meta) | LGPD compliance |

### Score Final

**12/12 critérios arquiteturais ✅ | 5/5 prioridades de investigação ✅**

**Status: APPROVED — READY FOR IMPLEMENTATION**

> O score reflete completude do documento de arquitetura, não garantia de implementação perfeita — esta é responsabilidade do @qa durante o ciclo de cada story.

---

*Documento gerado por Aria (@architect) com Kaio Brener — Advezo v2 Architecture — v1.0 — 2026-06-24*
