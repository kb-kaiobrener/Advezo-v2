-- ============================================================
-- Migration: 20260101000016_alerts_whatsapp  (logical number 000016)
-- Purpose: Tracking de envio de alertas via WhatsApp (Story 3.6 — Alertas
--          Proativos de Saldo via WhatsApp)
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.6.story.md (Dev Notes)
-- Depende de: 000008 (alerts), 000010 (whatsapp_accounts)
--
-- Notas de implementação (Dex / @dev):
--  - whatsapp_sent_at é o claim atômico do cron: UPDATE ... WHERE whatsapp_sent_at
--    IS NULL RETURNING id. Só um processo concorrente recebe a linha de volta —
--    o outro pula (AC 3.6.2). Em falha do worker, o claim é desfeito
--    (whatsapp_sent_at = NULL) e whatsapp_last_error preserva o diagnóstico;
--    o alerta volta a ser elegível no próximo ciclo (AC 3.6.3).
--  - alert_destination_type/id em whatsapp_accounts: destino de alertas POR CONTA,
--    independente do destination_id de relatórios (report_schedules) — AC 3.6.6.
--    NULL = não configurado; o cron ignora silenciosamente (AC 3.6.5).
--  - Colunas novas, todas nullable — migração aditiva, sem impacto em linhas
--    existentes nem em código anterior.
-- ============================================================

ALTER TABLE public.alerts
  ADD COLUMN whatsapp_sent_at        timestamptz,
  ADD COLUMN whatsapp_destination_id text,
  ADD COLUMN whatsapp_last_error     text;

-- Índice parcial para o caminho quente do cron (a cada 15 min):
-- alertas ativos ainda não enviados via WhatsApp.
CREATE INDEX alerts_whatsapp_pending_idx
  ON public.alerts (workspace_id, created_at DESC)
  WHERE resolved_at IS NULL AND whatsapp_sent_at IS NULL;

ALTER TABLE public.whatsapp_accounts
  ADD COLUMN alert_destination_type text
    CHECK (alert_destination_type IN ('individual', 'group')),
  ADD COLUMN alert_destination_id   text;
