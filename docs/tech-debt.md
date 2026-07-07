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

## Items Resolvidos

*(nenhum ainda)*

---

*Mantido por @architect. Atualizar ao abrir ou fechar cada item.*
