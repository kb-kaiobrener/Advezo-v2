-- ============================================================
-- Migration: 20260101000004_ad_accounts  (logical number 000004)
-- Purpose: Cria tabela ad_accounts (Story 2.1 — Conexão de Contas Meta Ads via OAuth)
-- DDL source: docs/stories/epics/epic-02-gestao-midia/2.1.story.md (Dev Notes)
-- Depende de: 000003 (set_updated_at()), 000002 (auth_workspace_id() JWT-based)
--
-- Notas de implementação (Dex / @dev):
--  - Trigger usa public.set_updated_at() (helper genérico criado na migration 000003),
--    NÃO trigger_set_timestamp() (esse nome no Dev Notes não existe neste projeto).
--  - Sem coluna deleted_at: o ciclo de vida da conta é controlado por `status`
--    (active | expired | error), conforme DDL autoritativa da story.
-- ============================================================

CREATE TABLE ad_accounts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id               uuid        REFERENCES clients(id) ON DELETE SET NULL,
  platform                text        NOT NULL CHECK (platform IN ('meta', 'google')),
  external_account_id     text        NOT NULL,
  account_name            text,
  encrypted_token         text        NOT NULL,
  encrypted_refresh_token text,                 -- NULL para Meta; obrigatório para Google (Story 2.2)
  token_type              text        DEFAULT 'access_token',
  status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'expired', 'error')),
  error_message           text,
  last_synced_at          timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_account_id)
);

ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON ad_accounts
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER ad_accounts_set_updated_at
  BEFORE UPDATE ON ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
