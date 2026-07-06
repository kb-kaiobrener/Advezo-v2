-- ============================================================
-- Migration: 20260101000013_report_schedules
-- Purpose: Cria tabela report_schedules (Story 3.3 — Configuração de Relatórios Automáticos por Cliente)
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.3.story.md (Dev Notes)
-- Depende de: 000003 (clients, set_updated_at()), 000002 (auth_workspace_id()),
--             000000 (workspaces)
--
-- Um schedule por cliente (UNIQUE workspace_id, client_id). O cron da Story 3.5
-- é o consumidor: lê report_schedules com is_active = true e dispara o envio.
-- ============================================================

CREATE TABLE public.report_schedules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id)     ON DELETE CASCADE,
  frequency        text        NOT NULL
                               CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  send_day         integer,    -- weekday 0-6 (weekly/biweekly) ou dia do mês 1-28 (monthly); NULL para daily
  send_time        time        NOT NULL DEFAULT '09:00:00',
  destination_type text        NOT NULL CHECK (destination_type IN ('individual', 'group')),
  destination_id   text        NOT NULL,  -- E.164 (individual) ou JID @g.us (group)
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_id)
);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON public.report_schedules
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER report_schedules_set_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
