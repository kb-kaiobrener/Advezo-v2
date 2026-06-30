-- ============================================================
-- Migration: 20260101000010_whatsapp_accounts  (logical number 000010)
-- Purpose: Tabela whatsapp_accounts — estado de conexão por conta WhatsApp
--          do worker Baileys (Epic 3, Story 3.1). Inclui campos do circuit
--          breaker (cb_failure_count, cb_paused_at).
-- DDL source: docs/stories/epics/epic-03-comunicacao-whatsapp/3.1.story.md (Dev Notes)
-- Depende de: 000000 (workspaces), 000002 (auth_workspace_id() JWT),
--             000003 (set_updated_at() helper)
--
-- Notas de implementação (Dex / @dev):
--  - account_id: número E.164 (ex: 5511999998888), text, SEM CHECK constraint de
--    formato (decisão de Checkpoint 0 confirmada pelo usuário). O JID Baileys
--    (...@s.whatsapp.net) é detalhe interno do protocolo e NÃO é persistido.
--  - updated_at + trigger whatsapp_accounts_set_updated_at usando public.set_updated_at()
--    (helper de 000003), mesmo padrão de leads/ad_accounts/clients. Sem o trigger,
--    updated_at nunca seria atualizado num UPDATE — necessário para a UI da Story 3.2
--    refletir mudanças de estado de conexão.
--  - status CHECK inclui 'cb_paused' para o estado de circuit breaker aberto.
--    cb_paused_at NULL = circuit fechado; NOT NULL = circuit aberto.
--  - RLS workspace_isolation: leitura/escrita pela UI escopada por workspace via JWT.
--    O worker (Railway) escreve via SERVICE_ROLE_KEY (createSupabaseServiceClient),
--    que ignora RLS — caminho server-side de confiança, escopa workspace_id na query.
--
-- DIVERGÊNCIA com architecture.md (reconciliação futura por @architect):
--  - architecture.md descreve um status CHECK diferente, sem o campo account_id, e
--    um bucket de Storage distinto. A STORY 3.1 é autoritativa (Article III —
--    Story-Driven Development). Esta migration segue a story, não o architecture.md.
-- ============================================================

CREATE TABLE public.whatsapp_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id       text NOT NULL,  -- E.164, ex: 5511999998888 (sem CHECK de formato)
  status           text NOT NULL DEFAULT 'disconnected'
                   CHECK (status IN ('disconnected','connecting','connected','cb_paused')),
  cb_failure_count integer NOT NULL DEFAULT 0,
  cb_paused_at     timestamptz,    -- NULL = circuit fechado; NOT NULL = circuit aberto
  connected_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, account_id)
);

-- RLS — isolamento por workspace (UI usa JWT; worker usa service-role que ignora RLS)
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON public.whatsapp_accounts
  USING (workspace_id = auth_workspace_id());

-- Trigger updated_at (mesmo helper de 000003) — necessário para a UI refletir estado
CREATE TRIGGER whatsapp_accounts_set_updated_at
  BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lookup por workspace + account (caminho quente do worker e da UI da Story 3.2)
CREATE INDEX whatsapp_accounts_workspace_idx
  ON public.whatsapp_accounts (workspace_id, account_id);
