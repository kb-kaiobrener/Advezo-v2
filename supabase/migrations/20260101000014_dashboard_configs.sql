-- ============================================================
-- Migration: 20260101000014_dashboard_configs
-- Purpose: Cria tabela dashboard_configs + bucket dashboard-logos
--          (Story 3.7 — Dashboard Compartilhável com Branding da Agência)
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.7.story.md (Dev Notes)
-- Depende de: 000003 (clients, set_updated_at()), 000002 (auth_workspace_id())
--
-- pgcrypto: gen_random_bytes vive no schema `extensions` no Supabase (não está no
--           search_path das migrations). Garantimos a extensão e referenciamos
--           explicitamente como extensions.gen_random_bytes().
--
-- Nota: 000013 não existe — 000012 (whatsapp_connections) foi a última aplicada.
--       Esta é a próxima migration na sequência.
--
-- Token público:
--   `token` é um hex de 40 caracteres (gen_random_bytes(20)) usado na URL
--   pública /dashboard/[token]. Gerado uma única vez por (workspace_id, client_id)
--   — o upsert do saveDashboardConfig preserva o token existente.
--
-- Segurança:
--   RLS isola por workspace para o role `authenticated` (UI do gestor). A rota
--   pública /dashboard/[token] usa createSupabaseServiceClient() (service-role),
--   que ignora RLS por design — o caller escopa por token.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.dashboard_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id)     ON DELETE CASCADE,
  token            text        NOT NULL UNIQUE
                               DEFAULT encode(extensions.gen_random_bytes(20), 'hex'),
  logo_url         text,       -- URL pública do Supabase Storage, ou NULL
  selected_metrics text[]      NOT NULL DEFAULT ARRAY['spend','impressions','clicks'],
  password_hash    text,       -- HMAC-SHA256(password + salt, DASHBOARD_AUTH_SECRET), NULL = público
  password_salt    text,       -- salt aleatório usado no hash
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_id)
);

ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON public.dashboard_configs
  FOR ALL USING (workspace_id = auth_workspace_id());
-- NOTA: rota pública /dashboard/[token] usa createSupabaseServiceClient() server-side
-- e não passa pelo RLS — o service client tem acesso irrestrito por design.

CREATE TRIGGER dashboard_configs_set_updated_at
  BEFORE UPDATE ON public.dashboard_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_configs TO authenticated;

-- ── Storage bucket dashboard-logos (T9) ──────────────────────────────
-- Bucket público: logos são servidos por URL pública (getPublicUrl), sem RLS.
-- Upload é feito server-side via service-role (uploadDashboardLogo Server Action).
INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-logos', 'dashboard-logos', true)
ON CONFLICT (id) DO NOTHING;
