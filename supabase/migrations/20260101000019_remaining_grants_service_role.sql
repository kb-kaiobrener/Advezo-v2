-- ============================================================
-- Migration: 20260101000019_remaining_grants_service_role  (logical number 000019)
-- Purpose: Fechar as lacunas restantes de GRANT para service_role
--          (TD-005 / GRANT-002 — hotfix pós-Epic 3).
--
-- Contexto:
--  - Mesma classe dos hotfixes 000011 (whatsapp_accounts) e 000017 (Epic 2):
--    tabelas criadas sem GRANT explícito ficam inacessíveis ao service_role
--    via PostgREST (403 permission denied).
--  - Auditoria completa (2026-07-07) encontrou 4 tabelas restantes:
--      lead_forms  → POST /api/lead-forms e submissão pública (Story 8.x)
--      leads       → /api/leads/submit usa service client (Story 8.3)
--      action_log  → registro de ações de campanha (Epic 2)
--      sync_errors → pipeline de sync (Epic 2)
--  - workspace_settings/workspaces/clients já OK (herdaram default privileges).
--
-- Idempotência: GRANT é idempotente no Postgres.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_forms  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_log  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_errors TO service_role;
