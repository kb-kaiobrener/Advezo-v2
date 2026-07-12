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

### TD-006 — Story 1.5 (clients CRUD) quebrada: `authenticated` sem grant em `clients`/`workspace_members` ✅ RESOLVIDO (re-gate PASS 2026-07-08)

**Re-gate @qa (PASS):** verificação com sessão real de gestor incluiu o **save real do formulário de edição** — POST da Server Action vinculada via flight protocol → 303 + nome alterado no banco (fonte de verdade). Lista com nome visível no HTML, edit 200 com defaultValues, RLS cross-workspace 403. Ver `docs/qa/gates/td-006-clients-grants.yml`. OBS-003 (low): `dashboard/page.tsx` mantém `clients ?? []` sem checar error — próxima manutenção.

**Correção aplicada (2026-07-08, @dev):**
1. **Migration 000021** (`clients_workspace_members_grants`): `GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated` + `GRANT SELECT ON workspace_members TO authenticated`. Policies ATIVAS verificadas no remoto via `supabase db query --linked` em `pg_policies` (equivalente à aba Policies do painel): `workspace_members` tem APENAS `workspace_isolation FOR ALL` (a `own_workspace_members` da 000000 foi dropada pela 000002 — não está ativa); `clients` tem `workspace_isolation FOR ALL` + `client_read FOR SELECT` (3.8). `with_check` null → USING vale como WITH CHECK; grant seguro.
2. **Swallows corrigidos:** `api/clients/route.ts` → checa `error`, retorna 500 JSON; `clients/page.tsx` → checa `error`, renderiza mensagem de falha (nunca lista vazia silenciosa).
3. **Bug adicional desmascarado e corrigido:** `edit/page.tsx` passava closure `(data) => updateClient(id, data)` de Server → Client Component (não serializável → 500). Pré-existente da Story 1.5, invisível porque o `notFound()` interrompia antes do form. Fix: `updateClient.bind(null, id)` (Server Action vinculada, padrão do `new/page.tsx`).

**Reteste (sessão real de gestor, role authenticated):** workspace_members SELECT 200 (retorna a própria membership); clients INSERT 201 / UPDATE 200; RLS barra INSERT cross-workspace 403; `GET /api/clients` lista o cliente (não `[]`); página `/clients` mostra o nome no HTML; `/clients/[id]/edit` → 200 (id inexistente → 404 preservado). Suíte 335 passed (baseline).

---

#### Registro original (2026-07-08, @qa):

### (histórico) TD-006 — Story 1.5 (clients CRUD) quebrada: `authenticated` sem grant em `clients`/`workspace_members` 🔴 CONFIRMADO

| Campo | Valor |
|-------|-------|
| **Severidade** | **HIGH — funcional, falha SILENCIOSA** |
| **Origem** | Re-gate TD-005 (@qa); verificação dedicada 2026-07-08 |
| **Arquivos** | `clients.ts`, `(dashboard)/clients/page.tsx`, `(dashboard)/clients/[id]/edit/page.tsx`, `(dashboard)/dashboard/page.tsx`, `api/clients/route.ts` |
| **Tabelas** | `clients`, `workspace_members` — 403 para `authenticated` |

**Verificação dedicada (sessão real de gestor, role authenticated — NÃO service_role):**

| Operação (via session client = authenticated) | Consumidor | REST | Efeito no app |
|---|---|---|---|
| `workspace_members` SELECT | `getAuthenticatedWorkspace` (base de TODAS as mutations) | **403** | membership null → `redirect('/onboarding')` |
| `clients` SELECT | `clients/page`, `edit/page`, `dashboard`, `api/clients` | **403** | lista/dashboard **vazios** (`data ?? []`); edição → `notFound()` **404** |
| `clients` INSERT | `createClient` | **403** | (não alcançado — redirect antes) |
| `clients` UPDATE | `updateClient`, `archiveClient` | **403** | (não alcançado — redirect antes) |
| `clients` DELETE | — (soft-delete via UPDATE) | **403** | n/a |

**Prova definitiva (falha silenciosa):** cliente real inserido no workspace do gestor (via service_role) EXISTE no banco (`0-0/1`), mas `GET /api/clients` do gestor **dono do workspace** retorna `[]`. O 403 é engolido por `data ?? []` (api/clients L20; clients/page; dashboard) — **pior que erro duro: dados do gestor ficam invisíveis sem nenhum aviso**. `edit/page` faz `if (!data) notFound()` → **404** ao editar qualquer cliente.

**Dúvida fechada (não é falso alarme):** varredura de TODOS os `GRANT ... TO authenticated` das migrations — apenas whatsapp_accounts (000011), whatsapp_connections (000012), report_schedules (000013), dashboard_configs (000014), report_logs (000015), client_users (000018), ad_accounts/ad_campaigns/campaign_metrics/lead_forms/leads (000018/000020). **Nenhum caminho concede `clients` nem `workspace_members` a authenticated.** Definitivamente quebrado.

**Por que não pegou antes:** `layout.tsx` lê `workspace_members` via **service client** (a navegação funciona), mascarando o problema; e os reads de clients engolem o 403 como lista vazia. Gates da Story 1.5 usaram mocks/service_role — mesmo ponto cego do TD-005.

**RLS (segurança do fix confirmada):** `clients` e `workspace_members` têm `workspace_isolation FOR ALL USING (workspace_id = auth_workspace_id())` sem `WITH CHECK` separado → o `USING` é aplicado como `WITH CHECK` no INSERT. Grant a authenticated é seguro (isolamento por workspace mantido), idêntico ao fix da 000020.

**Resolução proposta (decisão do @dev — grant vs refactor):**
- **Opção A (grant, consistente com 000020):** migration `GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;` + `GRANT SELECT ON public.workspace_members TO authenticated;`
- **Opção B (refactor):** `clients.ts` + read paths passam a usar service client com escopo explícito de workspace_id (padrão das actions novas — report-send/dashboard/alert-destination).
- **Adicional (independe da opção):** corrigir o swallow — `api/clients`, `clients/page`, `dashboard` devem checar `error` e sinalizar falha em vez de `data ?? []` silencioso.

**Reteste obrigatório:** sessão real de gestor — GET /api/clients mostra cliente existente; createClient/updateClient/archiveClient completam (não redirecionam a /onboarding); INSERT cross-workspace barrado por RLS.

**Trigger:** IMEDIATO (mesma criticidade do TD-005 — Story 1.5 é fundação). Dono: @dev, validação @qa com sessão real.

---

### NOTA-OBS-005 — `needs_review` derivado na leitura (decisão registrada, MAINT-01)

Decisão consciente (2026-07-11): manter derivado (`score < limiar AND reviewed_by IS NULL`), sem materializar campo. Consequências documentadas no cabeçalho de `classifier.ts`: mudar o limiar re-escopa a fila de não-revisados; **Epic 6 deve congelar o limiar no momento do envio da conversão** (requisito forward do gate do Epic 5). Materializar o campo no futuro = migration + backfill.

---

### TD-007 — Crons da Vercel reduzidos para 1×/dia (limite do plano Hobby) ⚠️ TEMPORÁRIO

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM — degradação funcional consciente |
| **Origem** | Deploy bloqueado na Vercel (Hobby não aceita cron < diário) — 2026-07-11 |
| **Arquivo** | `apps/web/vercel.json` |

**Descrição:** Frequências REDUZIDAS temporariamente para destravar o deploy — **não é o desenho real**:

| Cron | Desenho (story) | Temporário |
|---|---|---|
| `send-reports` (3.5) | `0 * * * *` (horário) | `0 8 * * *` |
| `send-alerts` (3.6) | `*/15 * * * *` (15 min) | `0 9 * * *` |
| `cleanup-messages` (5.3) | diário | `30 3 * * *` (inalterado) |

Horários espaçados de propósito. **Impactos:** relatórios com `send_time` ≠ 8h UTC não disparam no horário configurado (o `scheduleShouldFireNow` compara a hora exata — na prática só schedules das 8h rodam); alertas de saldo podem atrasar até 24h (desenho: ≤15 min).

**Resolução pendente (decisão do Kaio):** (a) upgrade do plano Vercel (Pro aceita as frequências originais), ou (b) migrar send-reports/send-alerts para o worker do Railway (setInterval + guard, padrão do classificador). Ao resolver, restaurar as schedules originais e revisar o acoplamento hora-exata do `scheduleShouldFireNow`.

---

## Items Resolvidos

*(nenhum ainda — TD-005 parcial, TD-006 aberto)*

---

*Mantido por @architect. Atualizar ao abrir ou fechar cada item.*
