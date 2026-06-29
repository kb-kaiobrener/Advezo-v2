-- ============================================================
-- Migration: 20260101000008_alerts  (logical number 000008)
-- Purpose: Cria alerts — alertas proativos de saldo por conta de anúncio
--          (Story 2.9 — Alertas de Saldo Proativo)
-- DDL source: docs/stories/epics/epic-02-gestao-midia/2.9.story.md (Checkpoint CP4)
-- Depende de: 000004 (ad_accounts), 000002 (auth_workspace_id() JWT-based),
--             000000 (workspaces)
--
-- Notas de implementação (Dex / @dev):
--  - CP4: a deduplicação NÃO depende apenas de uma query prévia no código. Um índice
--    único PARCIAL `alerts_active_unique (ad_account_id, alert_type) WHERE resolved_at
--    IS NULL` torna a invariante "no máximo 1 alerta ATIVO por (conta, tipo)" uma lei
--    do banco. Mesmo com 2 workers concorrentes (ou um retry), o 2º INSERT viola o
--    índice e falha — o cron captura o erro (código 23505) e segue, sem duplicar.
--    Quando o alerta é resolvido (resolved_at preenchido), ele sai do índice parcial,
--    liberando espaço para um novo alerta ativo futuro do mesmo par.
--  - `threshold_days`/`projected_days` registram o contexto da detecção no momento em
--    que o alerta foi criado (threshold vigente + projeção calculada) — auditável e
--    consumível pelo Epic 3 (Story 3.6) sem recalcular.
--  - `alert_type` CHECK começa só com 'low_balance' (AC 2.9.7). Extensível para
--    'whatsapp_disconnected' etc. via ALTER no Epic 3 — append-only ao CHECK.
--  - RLS por workspace_id = auth_workspace_id() (mesmo padrão de ad_accounts /
--    ad_campaigns / sync_errors / action_log). O cron usa service-role (ignora RLS);
--    a UI/Server Action usa o client com sessão (RLS escopa por workspace).
--  - alerts NÃO tem updated_at — o ciclo de vida é binário (ativo → resolvido via
--    resolved_at), sem mutações intermediárias, por isso sem trigger set_updated_at().
-- ============================================================

CREATE TABLE alerts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id  uuid        NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  alert_type     text        NOT NULL CHECK (alert_type IN ('low_balance')),
  threshold_days int         NOT NULL,
  projected_days numeric     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON alerts
  FOR ALL USING (workspace_id = auth_workspace_id());

-- CP4: deduplicação garantida no banco — no máximo 1 alerta ATIVO por (conta, tipo).
-- Índice único PARCIAL: linhas com resolved_at preenchido saem do índice, então um
-- alerta resolvido não bloqueia a criação de um novo alerta ativo no futuro.
CREATE UNIQUE INDEX alerts_active_unique
  ON alerts (ad_account_id, alert_type)
  WHERE resolved_at IS NULL;

-- Índice para a UI listar alertas ativos por conta (settings/integrations + badge).
CREATE INDEX alerts_account_active_idx
  ON alerts (ad_account_id)
  WHERE resolved_at IS NULL;
