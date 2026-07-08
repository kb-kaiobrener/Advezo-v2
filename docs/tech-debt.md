# Tech Debt Registry — Advezo v2

Registro formal de débitos técnicos identificados durante o desenvolvimento. Cada item tem severidade, origem, e a story/evento que deve resolver ou revisitar o item.

---

## Items Ativos

### TD-001 — `createWorkspace` não-atômica

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Origem** | Story 1.2 — QA Gate Wave 2 (@architect) |
| **Data** | 2026-06-25 |
| **Arquivo** | `apps/web/src/app/actions/workspace.ts` |

**Descrição:** Os dois INSERTs (workspace + workspace_members) são operações separadas. Se o segundo falhar, um workspace órfão fica no banco — inacessível por RLS mas inconsistente. O trigger auto-cria `workspace_settings` no primeiro INSERT via `SECURITY DEFINER`, impossibilitando wrap em transação client-side simples.

**Resolução sugerida:** Criar Supabase RPC `create_workspace_with_owner(name text)` que executa tudo em uma função `SECURITY DEFINER` com rollback automático.

**Trigger para resolver:** Antes do lançamento público (beta → GA). Qualquer story de onboarding refactor ou Epic de accounts.

---

### TD-002 — `isDashboard` no proxy muito amplo ⚠️ ATENÇÃO OBRIGATÓRIA

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Origem** | Story 1.2 — QA Gate Wave 2 (@architect) |
| **Data** | 2026-06-25 |
| **Arquivo** | `apps/web/src/proxy.ts` |

**Descrição:** A lógica atual trata como rota protegida (requer auth) qualquer pathname que não seja `/`, `/login`, `/register` ou `/onboarding`:

```typescript
const isDashboard = !isAuthRoute && !isOnboarding && pathname !== '/'
```

Ao introduzir qualquer rota pública (landing page, termos de uso, dashboard compartilhável, etc.), essa lógica vai interceptar a requisição e redirecionar para `/login` — comportamento silencioso e difícil de debugar.

**Resolução obrigatória:** Antes de criar qualquer rota pública, converter para allow-list explícita de rotas protegidas:

```typescript
const isDashboard = pathname.startsWith('/dashboard') ||
                    pathname.startsWith('/clientes') ||
                    pathname.startsWith('/configuracoes') ||
                    // ... demais rotas do app
```

**⚠️ TRIGGER OBRIGATÓRIO:** Esta correção DEVE acontecer na primeira story que introduzir qualquer rota pública. Candidato direto: **Story 3.7 — Dashboard Compartilhável** (rota pública `/s/[token]`). O @dev responsável por 3.7 deve consultar este item antes de implementar.

**Update 2026-07-07 (Wave 4, @dev):** Mitigado parcialmente via deny-list, não via a allow-list recomendada. Exclusões acumuladas em `proxy.ts`: `isPublicDashboard` (`/dashboard/`, Story 3.7), `isDashboardAuthApi` (`/api/dashboard/`, 3.7) e agora `isServiceRoute` (`/api/cron/`, `/api/sync/`, `/api/alerts/`, `/api/leads/process-queue`, Wave 4). O bug previsto aqui já causou 307 silencioso em **todos os crons do Epic 2 e da Story 2.9** (descoberto no QA gate da 3.6). A conversão para allow-list explícita continua pendente e recomendada — cada nova rota de serviço/pública ainda exige lembrar de adicionar exclusão. **@architect:** avaliar priorizar a allow-list antes do GA.

---

### TD-003 — RLS com `FOR ALL` sem separação de privilégios

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Origem** | Story 1.2 — QA Gate Wave 2 (@architect) |
| **Data** | 2026-06-25 |
| **Arquivo** | `supabase/migrations/20260101000001_rls_policies.sql` |

**Descrição:** As políticas RLS usam `FOR ALL` com a mesma condição para SELECT, INSERT, UPDATE e DELETE. Para o cenário atual (workspace de um único owner) é inócuo. Quando o feature de gestão de equipe for implementado, um `viewer` poderá tecnicamente alterar o nome do workspace ou remover membros.

**Resolução sugerida:** Criar migração com políticas granulares:
```sql
-- Exemplo: UPDATE no workspace só para owner/admin
CREATE POLICY workspace_update ON workspaces
  FOR UPDATE USING (
    id IN (SELECT workspace_id FROM workspace_members
           WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
```

**Trigger para resolver:** Story de gestão de equipe / convite de membros (Epic ainda não mapeado).

---

### TD-004 — `/api/leads/submit` redirecionado para /login pelo middleware ⚠️ POSSÍVEL QUEBRA EM PROD

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH (se o formulário público já estiver em uso) / MEDIUM (pré-produção) |
| **Origem** | Story 3.6 — QA Gate Wave 4 (re-teste com curl, @dev) |
| **Data** | 2026-07-07 |
| **Arquivo** | `apps/web/src/proxy.ts` + `apps/web/src/app/api/leads/submit/route.ts` |

**Descrição:** `/api/leads/submit` (Story 8.3) é endpoint **público** embutido em domínios de terceiros (CORS aberto), autenticado por `embed_token` no body + rate limit + gate de consentimento LGPD — **não** por sessão nem por `x-cron-secret`. O middleware `proxy.ts` (instância viva do TD-002) o redireciona para `/login` (307) quando não há cookie de sessão. Verificado via curl em 2026-07-07: `POST /api/leads/submit` → `307 → /login`. Consequência: um embed em site de cliente que POSTe para essa rota é redirecionado em vez de submeter o lead — **o formulário público não funciona**.

**Por que NÃO foi corrigido junto com a Wave 4:** o modelo de auth é diferente dos crons (`embed_token`, não `x-cron-secret`). A exclusão da Wave 4 (`isServiceRoute`) deliberadamente deixou `/api/leads/submit` de fora para evitar destravar uma rota pública sem revalidar seu modelo de segurança completo (CORS, rate limit por IP+token, consentimento). @pm/orchestrator instruiu investigação separada.

**Resolução sugerida:** Na Story 8.3 (ou story de correção dedicada), excluir `/api/leads/submit` do gate de sessão do `proxy.ts` (é público por design), e confirmar em QA que CORS, rate limit (`MAX_PER_IP_PER_HOUR`/`MAX_PER_TOKEN_PER_DAY`) e o gate de consentimento continuam íntegros com a rota acessível sem sessão. Idealmente resolver junto da conversão para allow-list do TD-002.

**Trigger para resolver:** Antes de qualquer landing page de terceiro ir ao ar com formulário embutido. Dono: Story 8.3 (@dev responsável) + @architect (allow-list do TD-002).

---

### TD-005 — Consumidores de `user_metadata.workspace_id` via getUser() quebrados ✅ RESOLVIDO (re-gate PASS 2026-07-08)

| Campo | Valor |
|-------|-------|
| **Severidade** | **HIGH — bloqueador funcional ativo** → RESOLVIDO |
| **Origem** | Escalação do OBS-002 (gate 3.8) por verificação dirigida — 2026-07-07 |
| **Estado** | ✅ Fechado. Iteração 1: getClaims (5 pontos). Iteração 2: migration **000020** (authenticated INSERT/UPDATE/DELETE + SELECT lead_forms/leads). Re-gate PASS com sessão real: ad_accounts INSERT próprio 201, cross-workspace 403 (RLS), lead-forms E2E 201. Ver `docs/qa/gates/td-005-hotfix.yml`. **TD-006 segue aberto (fora de escopo).** |
| **Arquivos** | `apps/web/src/app/api/oauth/meta/callback/route.ts` L130, `apps/web/src/app/api/oauth/google/callback/route.ts` L109, `apps/web/src/app/api/lead-forms/route.ts` L58, `apps/web/src/proxy.ts` L191 (`hasWorkspace`), `apps/web/src/app/(auth)/onboarding/page.tsx` L34 |

**Verificação (mesmo método do BLOCK-003, sessão real de gestor sintético com membership):**

```
JWT via claims (getClaims):       workspace_id = a5ae4432-…  (hook correto, = membership)
getUser().user_metadata (banco):  workspace_id = AUSENTE
VEREDICTO: 🔴 FONTES DIVERGEM — mesmo mecanismo do BLOCK-003
```

**Todos os 3 usuários reais do banco** têm `user_metadata.workspace_id` AUSENTE (nada no codebase escreve esse campo no banco; o hook escreve apenas claims do JWT).

**Impacto — consumidores fail-closed quebrados para TODO gestor:**
1. **OAuth Meta** → `?error=oauth_failed` antes de trocar o code — **conectar conta Meta é impossível**
2. **OAuth Google** → `?error=google_oauth_failed` — **impossível**
3. **`POST /api/lead-forms`** → 403 "Workspace não encontrado no token" — **criar lead form é impossível**
4. `proxy.ts hasWorkspace` — cosmético (gestor onboarded não é redirecionado de /onboarding)
5. `onboarding/page.tsx` — checagem client-side com a mesma fonte

**Evidência corroborante:** `ad_accounts` tem **0 linhas** — o fluxo de conexão OAuth nunca completou neste banco. Os gates do Epic 2 passaram por testes unitários (mocks com a fonte errada) — mesma classe de cegueira do BLOCK-003.

**O que NÃO está afetado:** RLS (`auth_workspace_id()` lê `auth.jwt()` — correto, provado igual à membership) e Server Actions (usam `getWorkspaceMembership()` via query). A autorização real está íntegra — por isso nada vazou; os fluxos simplesmente falham fechados.

**Fix (mesmo padrão do BLOCK-003 da 3.8):** nos consumidores, ler o claim via `supabase.auth.getClaims()` após `getUser()` (ou usar query de membership). ~5 pontos de código, sem migration.

**Bônus descoberto na verificação — GRANT-002:** `lead_forms` retorna **403 para service_role** (sem GRANT, mesma classe da migration 000017). Incluir `GRANT ... ON lead_forms TO service_role` (e revisar as demais tabelas do Epic 8: `leads`, etc.) na migration do fix.

**Trigger para resolver:** IMEDIATO — antes de qualquer uso real de OAuth/lead-forms. Dono: @dev (hotfix dirigido), validação @qa com sessão real (padrão da 3.8).

**Resolução aplicada (2026-07-07):**
- Os 5 pontos passaram a ler o claim via `supabase.auth.getClaims()` (JWT verificado/JWKS), padrão do fix BLOCK-003; `getUser()` mantido só para checagem de sessão.
- **GRANT-002 ampliado → migration 000019** `remaining_grants_service_role.sql`: auditoria completa encontrou 4 tabelas sem grant (`lead_forms`, `leads`, `action_log`, `sync_errors`), não só `lead_forms`. Todas passaram de 403 → 200.
- Mocks dos testes (`oauth-meta-callback`, `oauth-google-callback`, `lead-forms`) corrigidos para a fonte real (`getClaims`); suíte de volta ao baseline (335 passed).
- **Evidência (sessão real de gestor):** JWT `workspace_id` = membership; INSERT em `ad_accounts` com a shape exata do handler → **201**; teste de integração do callback Meta assere `upsert` com `workspace_id` vindo só do mock de `getClaims` (prova o caminho end-to-end até `ad_accounts`). Live Meta token exchange (consent no browser) segue como passo manual de staging — não afetado pelo fix.

---

### TD-006 — Gap sistêmico de GRANT `authenticated` em tabelas Epic 1/2 (session client) 🔴 provável quebra

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH (se clients CRUD via app for exercitado) |
| **Origem** | Re-gate TD-005 (@qa) — 2026-07-07 |
| **Arquivos** | `clients.ts` (session client), tabelas `workspace_members`, `clients`, `leads`, `lead_forms`, `ad_accounts` (INSERT/UPDATE) |

**Descrição:** O role `authenticated` (usado por `createSupabaseServerClient` = anon+cookie) recebe **403** em `workspace_members`, `clients`, `leads`, `lead_forms`, e em `ad_accounts` para INSERT/UPDATE (só SELECT foi concedido em 000018). Apenas tabelas com `GRANT ... TO authenticated` explícito funcionam (whatsapp_accounts, whatsapp_connections, report_schedules, dashboard_configs, report_logs, client_users).

**Verificado (token real de gestor, role authenticated):** SELECT `workspace_members` 403, INSERT `clients` 403, INSERT `ad_accounts` 403.

**Impacto:** `clients.ts` (`getAuthenticatedWorkspace` + `createClient`) usa session client → `workspace_members` 403 → membership null → redirect `/onboarding`; INSERT `clients` 403. CRUD de clientes (Story 1.5) provavelmente quebrado via app. `workspace.ts` (onboarding) não é afetado — usa service client.

**Resolução sugerida:** Auditoria completa session-client vs service-client; conceder `authenticated` (CRUD) nas tabelas consumidas por session client, OU padronizar handlers para service client com escopo explícito de workspace_id (padrão das actions novas). Coordenar com BLOCK-004/005 do TD-005.

**Parcialmente endereçado (2026-07-07):** migration 000020 concedeu authenticated em `lead_forms`/`leads` (além de ad_accounts/ad_campaigns/campaign_metrics). PENDENTE: `clients` e `workspace_members` seguem 403 para authenticated — `clients.ts` (`getAuthenticatedWorkspace` + `createClient`) usa session client e provavelmente ainda quebra. Confirmar e decidir grant authenticated vs refactor para service client.

**Trigger:** próxima story que tocar clients CRUD, ou auditoria dedicada de grants.

---

## Items Resolvidos

*(nenhum ainda — TD-005 parcial, TD-006 aberto)*

---

*Mantido por @architect. Atualizar ao abrir ou fechar cada item.*
