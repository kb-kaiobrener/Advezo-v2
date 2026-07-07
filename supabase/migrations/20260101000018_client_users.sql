-- ============================================================
-- Migration: 20260101000018_client_users  (logical number 000018)
-- Purpose: Painel logado do cliente final (Story 3.8) — tabela client_users,
--          função auth_client_id(), hook de JWT com anti-spoofing e policies
--          client_read (SELECT only) para o cliente ver apenas os próprios dados.
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.8.story.md (Dev Notes)
-- Depende de: 000000 (workspaces), 000002 (custom_access_token_hook original),
--             000003 (clients), 000004 (ad_accounts), 000006 (ad_campaigns,
--             campaign_metrics), 000017 (grants service_role Epic 2)
--
-- Notas de implementação (Dex / @dev):
--  - custom_access_token_hook: CREATE OR REPLACE da função de 000002. O hook já
--    está habilitado no Supabase Dashboard — replace de função NÃO exige novo
--    passo manual.
--  - ANTI-SPOOFING (AC 3.8.3): os DOIS claims são sempre sobrescritos — valor
--    real quando encontrado, REMOÇÃO quando não. Sem o strip, user_metadata
--    forjado via updateUser() persistiria no JWT e as policies client_read
--    vazariam dados cross-workspace. O strip do workspace_id corrige a mesma
--    brecha herdada da função original de 000002 (não é regressão).
--  - Policies client_read são ADITIVAS às workspace_isolation existentes
--    (policies do mesmo comando são OR entre si): gestor continua acessando
--    pelo claim workspace_id; cliente acessa SELECT pelo claim client_id.
--  - Grants de SELECT para authenticated em ad_accounts/ad_campaigns/
--    campaign_metrics: 000017 cobriu apenas service_role; a sessão do cliente
--    (authenticated) precisa de SELECT — RLS restringe as linhas.
-- ============================================================

-- ── 1. Tabela client_users ───────────────────────────────────────────
CREATE TABLE public.client_users (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id    uuid        NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  email        text        NOT NULL,
  invited_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  UNIQUE (user_id),                      -- 1 usuário = 1 cliente (modelo simples do MVP)
  UNIQUE (workspace_id, client_id, email)
);

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

-- Gestor gerencia convites do próprio workspace
CREATE POLICY workspace_isolation ON public.client_users
  FOR ALL USING (workspace_id = auth_workspace_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO authenticated;

-- ── 2. auth_client_id() — espelho de auth_workspace_id() (000002) ────
CREATE OR REPLACE FUNCTION public.auth_client_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'client_id')::uuid;
$$;

-- ── 3. Hook — replace com anti-spoofing dos dois claims (AC 3.8.3) ───
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claims            jsonb;
  user_workspace_id uuid;
  user_client_id    uuid;
BEGIN
  SELECT wm.workspace_id INTO user_workspace_id
  FROM   workspace_members wm
  WHERE  wm.user_id = (event ->> 'user_id')::uuid
  ORDER BY wm.created_at ASC LIMIT 1;

  SELECT cu.client_id INTO user_client_id
  FROM   client_users cu
  WHERE  cu.user_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  claims := event -> 'claims';

  -- SEMPRE sobrescreve: valor real OU remoção (anti-spoofing).
  -- Strip do workspace_id fecha a brecha herdada de 000002 (claim forjado
  -- via updateUser() persistia para usuários sem workspace).
  IF user_workspace_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_metadata,workspace_id}', to_jsonb(user_workspace_id::text));
  ELSE
    claims := claims #- '{user_metadata,workspace_id}';
  END IF;

  IF user_client_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_metadata,client_id}', to_jsonb(user_client_id::text));
  ELSE
    claims := claims #- '{user_metadata,client_id}';
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
-- (GRANTs do hook para supabase_auth_admin já existem de 000002 — replace preserva)

-- ── 4. Policies client_read — SELECT only, aditivas (OR) ─────────────
CREATE POLICY client_read ON public.clients
  FOR SELECT USING (id = auth_client_id());

CREATE POLICY client_read ON public.ad_accounts
  FOR SELECT USING (client_id = auth_client_id());

CREATE POLICY client_read ON public.ad_campaigns
  FOR SELECT USING (ad_account_id IN (
    SELECT id FROM public.ad_accounts WHERE client_id = auth_client_id()
  ));

CREATE POLICY client_read ON public.campaign_metrics
  FOR SELECT USING (ad_account_id IN (
    SELECT id FROM public.ad_accounts WHERE client_id = auth_client_id()
  ));

-- ── 5. Grants de leitura para authenticated (RLS restringe as linhas) ─
GRANT SELECT ON public.ad_accounts      TO authenticated;
GRANT SELECT ON public.ad_campaigns     TO authenticated;
GRANT SELECT ON public.campaign_metrics TO authenticated;
