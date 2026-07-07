-- ============================================================
-- Migration: 20260101000015_report_logs  (logical number 000015)
-- Purpose: Tabela report_logs — registro de envios de relatório via WhatsApp
--          (Story 3.5 — Envio de Relatório via WhatsApp)
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.5.story.md (Dev Notes)
-- Depende de: 000000 (workspaces), 000003 (clients), 000013 (report_schedules)
--
-- Notas de implementação (Dex / @dev):
--  - UNIQUE (schedule_id, period_start) é a chave de dedup do cron (AC 3.5.2):
--    INSERT ... ON CONFLICT DO NOTHING RETURNING id — se o RETURNING vier vazio,
--    o período já foi processado (por outro run ou retry) e o cron pula.
--    Envios manuais (sendNow/resendReport) operam por UPDATE no log existente ou
--    INSERT direto, fora do caminho de dedup.
--  - Sem updated_at/trigger — o ciclo de vida é pending → sent|failed via UPDATEs
--    pontuais do cron; sent_at registra o momento do sucesso.
--  - RLS por workspace_id (UI lê o histórico); cron usa service role (ignora RLS).
-- ============================================================

CREATE TABLE public.report_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id)        ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id)           ON DELETE CASCADE,
  schedule_id      uuid        NOT NULL REFERENCES public.report_schedules(id)  ON DELETE CASCADE,
  period_start     date        NOT NULL,
  period_end       date        NOT NULL,
  destination_type text        NOT NULL CHECK (destination_type IN ('individual', 'group')),
  destination_id   text        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at          timestamptz,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, period_start)  -- chave de dedup: 1 log por schedule por período
);

ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON public.report_logs
  FOR ALL USING (workspace_id = auth_workspace_id());

-- Histórico recente por cliente (UI — "Histórico de Envios", AC 3.5.6)
CREATE INDEX report_logs_client_recent_idx
  ON public.report_logs (client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_logs TO authenticated;
