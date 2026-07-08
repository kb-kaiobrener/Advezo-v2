-- ============================================================
-- Migration: 20260101000020_authenticated_write_grants  (logical number 000020)
-- Purpose: Conceder INSERT/UPDATE/DELETE ao role `authenticated` nas tabelas
--          escritas por handlers que usam o CLIENT DE SESSÃO
--          (createSupabaseServerClient = anon+cookie → role authenticated).
--          Fecha BLOCK-004 e BLOCK-005 do re-gate do TD-005 (iteração 2).
--
-- Contexto:
--  - TD-005 iteração 1 (migration 000019) concedeu para service_role, mas os
--    handlers de OAuth (meta/google callback) e lead-forms POST usam o client de
--    SESSÃO (authenticated), não service_role. Resultado: authenticated INSERT em
--    ad_accounts/lead_forms retornava 403 permission denied, mesmo após o fix do
--    guard (getClaims). Verificado com token real de gestor no re-gate.
--  - ad_accounts/ad_campaigns/campaign_metrics tinham apenas SELECT para
--    authenticated (000018) — faltavam INSERT/UPDATE/DELETE.
--  - lead_forms/leads não tinham nenhum grant para authenticated.
--
-- SEGURANÇA (por que o grant não superexpõe):
--  - As 5 tabelas têm RLS com policy workspace_isolation
--    `USING (workspace_id = auth_workspace_id())` e SEM `WITH CHECK` separado.
--    No Postgres, quando WITH CHECK é omitido, a expressão do USING é aplicada
--    TAMBÉM como WITH CHECK no INSERT/UPDATE — ou seja, o role authenticated só
--    consegue inserir/alterar linhas cujo workspace_id == claim do JWT (hook).
--    Um gestor não escreve em workspace alheio. O grant só habilita o acesso
--    à tabela; a RLS continua sendo o filtro por linha.
--  - Nenhuma concessão a `anon` — acesso público não muda.
--
-- Idempotência: GRANT é idempotente no Postgres.
-- ============================================================

GRANT INSERT, UPDATE, DELETE ON public.ad_accounts      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_campaigns     TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campaign_metrics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lead_forms       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.leads            TO authenticated;

-- lead_forms/leads: authenticated também precisa de SELECT (o handler lê após
-- inserir e a UI lista) — 000019 só cobriu service_role; ad_accounts já tinha
-- SELECT authenticated de 000018.
GRANT SELECT ON public.lead_forms TO authenticated;
GRANT SELECT ON public.leads      TO authenticated;
