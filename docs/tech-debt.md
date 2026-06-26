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

## Items Resolvidos

*(nenhum ainda)*

---

*Mantido por @architect. Atualizar ao abrir ou fechar cada item.*
