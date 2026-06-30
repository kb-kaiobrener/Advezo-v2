-- ============================================================
-- Migration: 20260101000009_leads  (logical number 000009)
-- Purpose: Schema de fundação do Epic 8 — Qualificação de Leads
--          (lead_processing_queue, lead_forms, lead_ads_configs, leads)
-- DDL source: docs/stories/epics/epic-08-qualificacao-leads/8.1.story.md (Dev Notes)
-- Depende de: 000000 (workspaces, workspace_settings), 000002 (auth_workspace_id() JWT),
--             000003 (clients, set_updated_at()), 000004 (ad_accounts)
--
-- Notas de implementação (Dex / @dev):
--  - `leads` possui updated_at: adicionado trigger leads_set_updated_at usando
--    public.set_updated_at() (helper de 000003), mesmo padrão de ad_accounts/clients.
--    Sem o trigger, updated_at jamais seria atualizado num UPDATE.
--  - workspace_settings.meta_leadgen_verify_token: usa ADD COLUMN IF NOT EXISTS
--    (idempotente; a tabela existe desde 000000).
--  - conversion_events: a tabela NÃO existe em nenhuma migration aplicada (pertence a
--    epic posterior — depende de `conversations`, ainda não criada). O DDL da story
--    assume sua existência ("criada na Story 2.x"), o que é factualmente incorreto.
--    A extensão do CHECK constraint foi envolvida num bloco condicional (to_regclass)
--    para que: (a) `supabase db push` NÃO quebre agora (AC 8.1.5); (b) a extensão se
--    aplique automaticamente quando a tabela for criada num epic futuro (AC 8.1.4 intent).
--    DROP CONSTRAINT IF EXISTS torna o bloco idempotente e seguro a re-execuções.
-- ============================================================

-- ── LEAD_PROCESSING_QUEUE ─────────────────────────────────────
-- Padrão: conversation_classification_queue (Epic 2)
CREATE TABLE lead_processing_queue (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meta_lead_id  text        NOT NULL,
  ad_account_id uuid        NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','completed','failed')),
  retry_count   integer     NOT NULL DEFAULT 0,
  last_error    text,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
ALTER TABLE lead_processing_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_processing_queue
  USING (workspace_id = auth_workspace_id());
-- Dedup de webhook duplicado na fila (Meta pode entregar o mesmo evento mais de uma vez)
CREATE UNIQUE INDEX lead_queue_meta_lead_id_unique ON lead_processing_queue (meta_lead_id);
CREATE INDEX lead_queue_worker_idx ON lead_processing_queue (status, retry_count, enqueued_at)
  WHERE status IN ('pending','failed') AND retry_count < 3;

-- ── LEAD_FORMS ────────────────────────────────────────────────
CREATE TABLE lead_forms (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id           uuid    REFERENCES clients(id) ON DELETE SET NULL,
  ad_account_id       uuid    REFERENCES ad_accounts(id) ON DELETE SET NULL,
  name                text    NOT NULL,
  slug                text    NOT NULL,
  embed_token         text    NOT NULL UNIQUE,
  fields              jsonb   NOT NULL DEFAULT '[]',
  qualification_rules jsonb   NOT NULL DEFAULT '[]',
  allowed_origins     text[],
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_forms USING (workspace_id = auth_workspace_id());

-- ── LEAD_ADS_CONFIGS ─────────────────────────────────────────
CREATE TABLE lead_ads_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  leadgen_form_id text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, leadgen_form_id)
);
ALTER TABLE lead_ads_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON lead_ads_configs USING (workspace_id = auth_workspace_id());

-- ── LEADS ────────────────────────────────────────────────────
CREATE TABLE leads (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id        uuid    REFERENCES clients(id) ON DELETE SET NULL,
  lead_form_id     uuid    REFERENCES lead_forms(id) ON DELETE SET NULL,
  meta_lead_id     text,
  source           text    NOT NULL CHECK (source IN ('landing_page','lead_ads')),
  status           text    NOT NULL DEFAULT 'novo'
                             CHECK (status IN ('novo','qualificado','desqualificado','convertido')),
  name             text    NOT NULL,
  phone_hash       text    NOT NULL,
  email_encrypted  text,
  consent_given_at timestamptz,
  field_data       jsonb   NOT NULL DEFAULT '{}',
  qualified_at     timestamptz,
  converted_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON leads USING (workspace_id = auth_workspace_id());

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dedup lead ativo por (client, phone) — libera slot quando desqualificado (FR-QC6)
CREATE UNIQUE INDEX leads_active_dedup ON leads (client_id, phone_hash)
  WHERE status NOT IN ('desqualificado');

-- Dedup entrega duplicada de webhook Meta
CREATE UNIQUE INDEX leads_meta_lead_id_unique ON leads (meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;

-- Lookup leads por conta
CREATE INDEX leads_account_status_idx ON leads (workspace_id, status, created_at DESC);

-- ── ALTERAÇÕES EM TABELAS EXISTENTES ─────────────────────────

-- workspace_settings: campo verify_token para webhook Meta Lead Ads
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS meta_leadgen_verify_token text;
CREATE INDEX IF NOT EXISTS ws_verify_token_idx ON workspace_settings (meta_leadgen_verify_token)
  WHERE meta_leadgen_verify_token IS NOT NULL;

-- conversion_events: estende event_name para suportar Lead e CompleteRegistration.
-- A tabela conversion_events ainda não existe (epic futuro). Aplicação condicional:
-- roda agora se já existir; caso contrário, será aplicada quando a tabela for criada.
DO $$
BEGIN
  IF to_regclass('public.conversion_events') IS NOT NULL THEN
    ALTER TABLE conversion_events DROP CONSTRAINT IF EXISTS conversion_events_event_name_check;
    ALTER TABLE conversion_events ADD CONSTRAINT conversion_events_event_name_check
      CHECK (event_name IN ('Purchase','Lead','CompleteRegistration'));
  END IF;
END $$;
