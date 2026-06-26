-- ============================================================
-- Migration: 20260101000002_auth_workspace_id_hook
-- Purpose: Alinha auth_workspace_id() com a especificação da
--          arquitetura (JWT-based) e cria o custom_access_token_hook
--          que injeta workspace_id no JWT no momento do login.
--          Reverte as policies subquery da Wave 2 para o padrão
--          auth_workspace_id() conforme docs/architecture.md Seção 9.
--
-- ⚠️  PASSO MANUAL OBRIGATÓRIO após aplicar esta migration:
--     Supabase Dashboard → Authentication → Hooks →
--     Custom Access Token → selecionar: public.custom_access_token_hook
--     Ver: docs/architecture.md Seção 9 — "Auth Hook (Passo Manual)"
-- ============================================================

-- ── 1. REPLACE auth_workspace_id() — versão JWT ──────────────────────
-- Substitui a implementação de subquery (000000) pela leitura do JWT.
-- STABLE permite que o Postgres faça cache por query (sem re-execução por linha).

CREATE OR REPLACE FUNCTION public.auth_workspace_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::uuid;
$$;

-- ── 2. CREATE custom_access_token_hook ──────────────────────────────
-- Invocado pelo Supabase Auth antes de emitir o access token.
-- SECURITY DEFINER: executa como owner (bypassa RLS) para ler workspace_members.
-- Injeta workspace_id do primeiro workspace do usuário em user_metadata.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims            jsonb;
  user_workspace_id uuid;
BEGIN
  SELECT wm.workspace_id INTO user_workspace_id
  FROM   workspace_members wm
  WHERE  wm.user_id = (event ->> 'user_id')::uuid
  ORDER BY wm.created_at ASC
  LIMIT  1;

  claims := event -> 'claims';

  IF user_workspace_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{user_metadata,workspace_id}',
      to_jsonb(user_workspace_id::text)
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- ── 3. GRANT — permite que o Supabase Auth invoque o hook ────────────

GRANT USAGE  ON SCHEMA public                                  TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ── 4. DROP Wave 2 subquery policies ────────────────────────────────

DROP POLICY IF EXISTS workspace_member_access   ON workspaces;
DROP POLICY IF EXISTS own_workspace_members     ON workspace_members;
DROP POLICY IF EXISTS workspace_settings_access ON workspace_settings;

-- ── 5. RECREATE usando auth_workspace_id() — padrão da arquitetura ──

CREATE POLICY workspace_isolation ON workspaces
  FOR ALL USING (id = auth_workspace_id());

CREATE POLICY workspace_isolation ON workspace_members
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE POLICY workspace_isolation ON workspace_settings
  FOR ALL USING (workspace_id = auth_workspace_id());
