# Story MAINT-01 — Manutenção consolidada pós-Epics 4/5

## Status

**Status:** Ready
**Tipo:** Manutenção (fora dos epics numerados)
**Origem:** Itens registrados em gates e tech-debt (FU-001, OBS-004, OBS-005, UI-001 + achado de revisão)
**Criada em:** 2026-07-11

## Executor Assignment

| Role | Agent | Notes |
|------|-------|-------|
| Executor | @dev (Dex) | **YOLO, sem checkpoint** — risco baixo em todos os itens |
| Quality Gate | @qa (Quinn) | **Simplificado** — testes dos itens 1/2/5 + conferência visual do 4 |

---

## Acceptance Criteria / Tasks

- [ ] **AC 1 (FU-001, Epic 4)** — Claim atômico na disputa de clique em `apps/whatsapp-worker/src/tracking.ts`: antes do INSERT da conversa tracked, `UPDATE tracked_clicks SET phone_matched = true WHERE id = X AND phone_matched = false` com `.select().maybeSingle()` (padrão da Story 3.6). Claim perdido → re-consulta o próximo clique da janela; sem sobra → `untracked`. Dois números simultâneos nunca vinculam ao mesmo `click_id`. Teste de concorrência simulada obrigatório; janela documentada no cabeçalho do módulo.

- [ ] **AC 2 (OBS-004, Epic 5)** — Em `parseClassification` (`classifier.ts`), não interpolar valor bruto vindo do modelo em mensagens de erro que alcançam `conversation_classification_queue.error`: truncar a 20 chars E filtrar para `[a-z_]` (ou simplesmente omitir o valor). Teste: resposta com `funnel_stage` malicioso/longo não vaza além do limite.

- [ ] **AC 3 (OBS-005, Epic 5)** — Documentar no cabeçalho de `classifier.ts` e em `docs/tech-debt.md` a decisão sobre `needs_review` derivado na leitura vs AC 5.6.4: **manter derivado** (decisão default desta story — mais simples, sem migration), registrando explicitamente que (a) mudar o limiar re-escopa a fila de itens não revisados e (b) o Epic 6 DEVE congelar o limiar no momento do envio da conversão (requisito forward já amarrado no gate do Epic 5). Se o @dev discordar do default, materializar `needs_review` exige migration → parada obrigatória.

- [ ] **AC 4 (UI-001, Epic 5)** — Badge numérico de pendentes de revisão no **menu lateral global** (`Sidebar.tsx`), item "Rastreamento", conforme AC 5.4.6 original. Contagem = classificações com `confidence_score < limiar AND reviewed_by IS NULL` do workspace. Pode ser client-side (fetch leve) ou via layout server — @dev decide (IDS). Manter também os links do header da seção.

- [ ] **AC 5 (revisão @pm)** — Em `reviewClassification` (`classification-review.ts`), garantir que TODA validação de entrada (incluindo o shape de `data` e tipos de `sale_value_estimate`) ocorra ANTES de `getMembership()` — padrão das Stories 3.3/3.6. Teste: input inválido não dispara nenhuma chamada ao banco/auth.

- [ ] **T-final** — Testes verdes (web + worker), typecheck/lint limpos, checkboxes e File List atualizados nesta story.

---

## Dev Notes

- AC 1: cuidado com o teste existente "match LIFO" — o mock precisa suportar o novo UPDATE condicional com RETURNING (mesma evolução de harness feita na 3.6/3.8).
- AC 4: `Sidebar.tsx` é client component e já usa `createSupabaseBrowserClient` (subpath `/browser` — NUNCA o barrel, lição IMPORT-001/002). **Divisão de fontes CONFIRMADA (2026-07-11):** `workspace_settings` NÃO tem GRANT para authenticated em nenhuma migration (nem a original nem a 000023) — leitura e escrita do limiar passam por service role dos dois lados hoje. Portanto: **o limiar vem SEMPRE via servidor** (service role, padrão da página de configurações — prop do layout/server ou endpoint leve autenticado), **nunca** por consulta client-side direta contra `workspace_settings`. Só a contagem de `conversation_classifications` (grant SELECT authenticated + RLS corretos) pode ser client-side.
- AC 5: hoje a validação de `funnel_stage` já precede a membership; o AC formaliza o padrão completo (shape/tipos) e trava com teste.

---

## Dev Agent Record

*(preencher — modo YOLO: decisões IDS registradas aqui)*

### File List

*(preencher)*

---

## QA Results

*(gate simplificado)*

---

## Change Log

| Data | Autor | Ação |
|------|-------|------|
| 2026-07-11 | Morgan (@pm) | Story de manutenção criada consolidando FU-001, OBS-004, OBS-005 (decisão default: manter derivado + documentar), UI-001 e achado de validação pré-membership. YOLO sem checkpoint; QA simplificado. Status: Ready. |
| 2026-07-11 | Morgan (@pm) | Revisão pré-dev AC 4: confirmado que `workspace_settings` não tem GRANT para authenticated (nenhuma migration) — instrução condicional trocada por direta: limiar SEMPRE via servidor (service role); só a contagem de `conversation_classifications` pode ser client-side. |
