-- ============================================================
-- Migration: 20260101000022_tracking_schema  (logical number 000022)
-- Purpose: Epic 4 Story 4.1 — schema de rastreamento de origem:
--          tracking_links, tracked_clicks, tracked_conversations.
-- DDL source: docs/prd.md § Epic 4, Story 4.1 (AC 4.1.1–4.1.7)
-- Depende de: 000000 (workspaces), 000003 (clients, set_updated_at)
--
-- Notas de implementação (Dex / @dev):
--  - LGPD (AC 4.1.6): phone_number_hash e ip_hash usam HMAC-SHA256 com salt
--    derivado de workspace_id + GLOBAL_HMAC_SECRET (env). PSEUDONIMIZAÇÃO com
--    controle de acesso (LGPD Art. 5º, XII) — o sistema retém capacidade de
--    re-identificação. NUNCA descrever como "anônimo".
--  - tracked_clicks NÃO tem workspace_id direto — herda via link_id →
--    tracking_links (RLS via subquery). Escrita é exclusiva do redirect
--    público /t/[code] (service_role) e do worker (service_role).
--  - Grants: service_role + authenticated (lição TD-005/TD-006 — UI de links
--    e dashboard usam session client; redirect e worker usam service role).
--    tracked_clicks: authenticated só SELECT (nunca escreve clique).
--  - code: 8 chars alfanuméricos gerados na aplicação; UNIQUE global (rota
--    pública /t/{code} não tem contexto de workspace).
--
-- ROLLBACK (AC 4.1.7):
--   DROP TABLE IF EXISTS public.tracked_conversations;
--   DROP TABLE IF EXISTS public.tracked_clicks;
--   DROP TABLE IF EXISTS public.tracking_links;
--   (ordem inversa das FKs; nenhum objeto compartilhado é alterado)
-- ============================================================

-- ── 1. tracking_links ────────────────────────────────────────────────
CREATE TABLE public.tracking_links (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id            uuid        NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  code                 text        NOT NULL UNIQUE,
  source_type          text        NOT NULL CHECK (source_type IN ('meta_ad', 'google_ad', 'custom')),
  source_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- campaign_id/adset_id/ad_id ou { label }
  destination_whatsapp text        NOT NULL,                       -- E.164 do WhatsApp do cliente
  active               boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON public.tracking_links
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER tracking_links_set_updated_at
  BEFORE UPDATE ON public.tracking_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX tracking_links_code_idx   ON public.tracking_links (code);
CREATE INDEX tracking_links_client_idx ON public.tracking_links (workspace_id, client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_links TO authenticated;

-- ── 2. tracked_clicks ────────────────────────────────────────────────
CREATE TABLE public.tracked_clicks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id       uuid        NOT NULL REFERENCES public.tracking_links(id) ON DELETE CASCADE,
  clicked_at    timestamptz NOT NULL DEFAULT now(),
  ip_hash       text        NOT NULL,  -- HMAC-SHA256(ip, salt(workspace)) — pseudonimizado (LGPD)
  user_agent    text,
  phone_matched boolean     NOT NULL DEFAULT false,
  gclid         text                                    -- ?gclid= do Google Ads (nullable)
);

ALTER TABLE public.tracked_clicks ENABLE ROW LEVEL SECURITY;
-- workspace herdado via tracking_links (tracked_clicks não tem workspace_id)
CREATE POLICY workspace_isolation ON public.tracked_clicks
  FOR ALL USING (link_id IN (
    SELECT id FROM public.tracking_links WHERE workspace_id = auth_workspace_id()
  ));

CREATE INDEX tracked_clicks_link_idx    ON public.tracked_clicks (link_id);
CREATE INDEX tracked_clicks_recency_idx ON public.tracked_clicks (clicked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_clicks TO service_role;
GRANT SELECT ON public.tracked_clicks TO authenticated;  -- UI só lê; escrita é do redirect/worker

-- ── 3. tracked_conversations ─────────────────────────────────────────
CREATE TABLE public.tracked_conversations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id)     ON DELETE CASCADE,
  client_id           uuid        NOT NULL REFERENCES public.clients(id)        ON DELETE CASCADE,
  link_id             uuid        REFERENCES public.tracking_links(id)          ON DELETE SET NULL,
  click_id            uuid        REFERENCES public.tracked_clicks(id)          ON DELETE SET NULL,
  phone_number_hash   text        NOT NULL,  -- HMAC-SHA256(E.164, salt(workspace)) — pseudonimizado (LGPD)
  first_message_at    timestamptz NOT NULL,
  origin_confirmed_at timestamptz,
  status              text        NOT NULL CHECK (status IN ('tracked', 'untracked')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_id, phone_number_hash)  -- 1 conversa por número por cliente
);

ALTER TABLE public.tracked_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON public.tracked_conversations
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE INDEX tracked_conversations_phone_idx  ON public.tracked_conversations (phone_number_hash);
CREATE INDEX tracked_conversations_client_idx ON public.tracked_conversations (workspace_id, client_id, first_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_conversations TO service_role;
GRANT SELECT ON public.tracked_conversations TO authenticated;  -- dashboard lê; escrita é do worker
