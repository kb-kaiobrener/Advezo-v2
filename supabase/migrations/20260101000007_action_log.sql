-- ============================================================
-- Migration: 20260101000007_action_log  (logical number 000007)
-- Purpose: Cria action_log — auditoria de mutações financeiras inline
--          (Story 2.7 — Pausar/Ativar + Ajustar Orçamento via API externa)
-- DDL source: docs/stories/epics/epic-02-gestao-midia/2.7.story.md (Checkpoint CP2)
-- Depende de: 000004 (ad_accounts), 000002 (auth_workspace_id() JWT-based),
--             000000 (workspaces)
--
-- Notas de implementação (Dex / @dev):
--  - CP1: `status` tem 3 estados ('pending' → 'success'/'failed'). A linha é
--    inserida ANTES da chamada à API externa (status='pending'), garantindo
--    rastreabilidade mesmo se houver crash entre a chamada e a resposta.
--  - CP2: `platform text` é explícito (não derivado via join com ad_accounts) —
--    facilita auditoria e preserva o registro mesmo após a conta ser removida.
--  - `campaign_id` é o external_campaign_id (text, NÃO FK) — o log de auditoria
--    sobrevive ao DELETE da campanha local. `ad_account_id` usa ON DELETE SET NULL
--    pelo mesmo motivo (preserva o histórico).
--  - RLS por workspace_id = auth_workspace_id() (mesmo padrão de ad_accounts /
--    ad_campaigns / sync_errors). Como o JWT injeta o workspace_id do membro, todos
--    os membros do workspace (incluindo admin) veem os logs do próprio workspace —
--    satisfaz AC 2.7.7 (membro vê logs do workspace; admin vê logs de todos os
--    membros, pois todos compartilham o mesmo workspace_id).
--  - action_log NÃO tem updated_at — é append-only com transições controladas pela
--    Server Action (pending → success/failed), por isso sem trigger set_updated_at().
-- ============================================================

CREATE TABLE action_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL,
  ad_account_id  uuid        REFERENCES ad_accounts(id) ON DELETE SET NULL,
  platform       text        NOT NULL CHECK (platform IN ('meta', 'google')),
  campaign_id    text        NOT NULL,  -- external_campaign_id (text, não FK — preserva log após delete)
  action_type    text        NOT NULL CHECK (action_type IN ('pause', 'activate', 'update_budget')),
  old_value      jsonb,
  new_value      jsonb,
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'success', 'failed')),
  api_error      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON action_log
  FOR ALL USING (workspace_id = auth_workspace_id());

-- Índice para consultas de auditoria por workspace ordenadas no tempo.
CREATE INDEX action_log_workspace_created_idx
  ON action_log (workspace_id, created_at DESC);
