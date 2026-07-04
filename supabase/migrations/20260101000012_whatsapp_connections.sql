-- ============================================================
-- Migration: 20260101000012_whatsapp_connections
-- Purpose: Cria tabela whatsapp_connections (Story 3.2 — Conexão de WhatsApp por Cliente)
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.2.story.md (Dev Notes)
-- Depende de: 000003 (clients, set_updated_at()), 000002 (auth_workspace_id()),
--             000010 (whatsapp_accounts)
--
-- Nota: 000011 foi ocupada por whatsapp_accounts_grants (fix de produção 2026-07-02).
--
-- Relação com whatsapp_accounts:
--   whatsapp_connections liga client_id → account_id (número E.164).
--   O estado de circuit breaker (cb_paused_at) vive em whatsapp_accounts e é
--   derivado na UI via JOIN — nunca escrito em whatsapp_connections.status.
-- ============================================================

CREATE TABLE public.whatsapp_connections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES public.clients(id)     ON DELETE CASCADE,
  account_id      text        NOT NULL,       -- E.164, ex: 5511999998888
  status          text        NOT NULL DEFAULT 'disconnected'
                              CHECK (status IN ('disconnected', 'connecting', 'connected')),
  -- cb_paused é derivado de whatsapp_accounts.cb_paused_at — nunca escrito nesta coluna
  connected_at    timestamptz,
  notice_template text,                       -- aviso ao titular (NFR-8 / AC 3.2.3)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_id, account_id)
);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON public.whatsapp_connections
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER whatsapp_connections_set_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
