-- ============================================================
-- Migration: 20260101000006_campaigns_and_metrics  (logical number 000006)
-- Purpose: Cria ad_campaigns, campaign_metrics e sync_errors
--          (Story 2.3 — Sync de Campanhas e Métricas Meta Ads)
-- DDL source: docs/stories/epics/epic-02-gestao-midia/2.3.story.md (Dev Notes)
-- Depende de: 000004 (ad_accounts), 000003 (set_updated_at()), 000002 (auth_workspace_id())
--
-- Notas de implementação (Dex / @dev):
--  - RLS por workspace_id = auth_workspace_id() (mesmo padrão de ad_accounts).
--  - Trigger updated_at usa public.set_updated_at() (helper genérico da 000003);
--    aplicado apenas em ad_campaigns (campaign_metrics e sync_errors não têm
--    coluna updated_at — campaign_metrics usa synced_at controlado pelo upsert).
--  - Deduplicação: UNIQUE (campaign_id, date) em campaign_metrics garante que o
--    upsert ON CONFLICT representa sempre a mesma janela de atribuição (7d_click).
-- ============================================================

-- ── AD_CAMPAIGNS ─────────────────────────────────────────────
CREATE TABLE ad_campaigns (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id        uuid        NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  platform             text        NOT NULL CHECK (platform IN ('meta', 'google')),
  external_campaign_id text        NOT NULL,
  name                 text,
  status               text        CHECK (status IN ('active', 'paused', 'deleted', 'archived')),
  objective            text,
  daily_budget         numeric,
  lifetime_budget      numeric,
  start_time           timestamptz,
  stop_time            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_campaign_id)
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON ad_campaigns
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER ad_campaigns_set_updated_at
  BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── CAMPAIGN_METRICS ─────────────────────────────────────────
CREATE TABLE campaign_metrics (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  impressions  bigint      NOT NULL DEFAULT 0,
  clicks       bigint      NOT NULL DEFAULT 0,
  spend        numeric     NOT NULL DEFAULT 0,
  conversions  bigint      NOT NULL DEFAULT 0,
  revenue      numeric     NOT NULL DEFAULT 0,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);

ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON campaign_metrics
  FOR ALL USING (workspace_id = auth_workspace_id());

-- ── SYNC_ERRORS ──────────────────────────────────────────────
CREATE TABLE sync_errors (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id uuid        REFERENCES ad_accounts(id) ON DELETE SET NULL,
  platform      text,
  error_type    text        NOT NULL,
  error_message text        NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON sync_errors
  FOR ALL USING (workspace_id = auth_workspace_id());
