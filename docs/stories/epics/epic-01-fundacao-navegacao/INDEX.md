# Epic 01 — Fundação e Navegação

**Status:** Ready for Execution
**Criado por:** Morgan (@pm) — 2026-06-25
**Aprovado por:** Kaio Brener (Product Owner)

## Goal

Estabelecer toda a infraestrutura técnica do projeto (Next.js no Vercel, Supabase com RLS, Railway skeleton) e entregar a primeira fatia de valor visível ao gestor: autenticação multi-tenant funcional, design system em tons de azul, navegação lateral com 7 itens, seletor de cliente/conta e dashboard principal com indicadores de saúde por cor.

## Referências

- PRD: `docs/prd.md` — Section 11, Epic 1 (Stories 1.1–1.6)
- Arquitetura: `docs/architecture.md`
- UX Spec: `docs/ux-design-spec.md`

## Stories

| # | Story | Status | Executor | Quality Gate |
|---|-------|--------|----------|-------------|
| 1.1 | Setup de Projeto e Infraestrutura Base | Draft | @dev | @architect |
| 1.2 | Autenticação Multi-Tenant e Estrutura de Workspace | Draft | @dev | @architect |
| 1.3 | Design System e Componentes Base | Draft | @dev | @architect |
| 1.4 | Gestão de Clientes (CRUD) | Draft | @dev | @architect |
| 1.5 | Layout de Navegação Lateral e Seletor de Cliente | Draft | @dev | @architect |
| 1.6 | Dashboard Principal com Indicadores de Saúde | Draft | @dev | @architect |

## Wave Structure

```
Wave 1: Setup (1.1)                    ← fundação obrigatória
Wave 2: Auth + Design System (1.2, 1.3) ← paralelo — sem conflito
Wave 3: Clients + Navigation (1.4, 1.5) ← sequencial — 1.4 antes de 1.5
Wave 4: Dashboard (1.6)                 ← depende de 1.4 + 1.5
```

## Execution Plan

`EPIC-01-EXECUTION.yaml` neste diretório.

## Pós-Epic

Após aprovação do QA gate final: iniciar Epic 2 (Gestão de Mídia).
Bloqueante global: Story 3.1 (Migração Baileys) deve ser executada antes de Epic 3.
