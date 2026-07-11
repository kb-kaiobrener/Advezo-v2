-- ============================================================
-- Migration: 20260101000023_classification_schema  (logical 000023)
-- Purpose: Epic 5 Stories 5.1 + 5.6 — fila de classificação, classificações,
--          classification_status em tracked_conversations e limiar de
--          confiança em workspace_settings (evita 2ª migration na wave 5.6).
-- DDL source: docs/prd.md § Epic 5 (AC 5.1.1–5.1.6, 5.6.2)
--
-- Notas (Dex / @dev):
--  - Fila escrita pelo worker Baileys e consumida pelo worker de classificação
--    (ambos service_role); UI só lê (authenticated SELECT) — badge/diagnóstico.
--  - conversation_classifications: worker escreve (service_role); UI lê E
--    corrige (Story 5.4: confirmar/corrigir → authenticated SELECT+UPDATE).
--  - Grants na criação, por role — lição TD-005/TD-006.
--  - LGPD (AC 5.3.9): a fila referencia a conversa; conteúdo bruto de mensagem
--    processado via subprocessador Anthropic tem retenção máx. 90 dias pós-
--    classificação (job de limpeza: pendência registrada no epic).
--
-- ROLLBACK (AC 5.1.6):
--   ALTER TABLE public.tracked_conversations DROP COLUMN classification_status;
--   DROP TABLE IF EXISTS public.conversation_classifications;
--   DROP TABLE IF EXISTS public.conversation_classification_queue;
-- ============================================================

-- ── 1. Fila de processamento (AC 5.1.1) ──────────────────────────────
CREATE TABLE public.conversation_classification_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES public.tracked_conversations(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  error           text,
  retry_count     integer     NOT NULL DEFAULT 0
);

ALTER TABLE public.conversation_classification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON public.conversation_classification_queue
  FOR ALL USING (workspace_id = auth_workspace_id());

-- caminho quente do polling do worker (AC 5.1.4)
CREATE INDEX ccq_status_created_idx
  ON public.conversation_classification_queue (status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_classification_queue TO service_role;
GRANT SELECT ON public.conversation_classification_queue TO authenticated;

-- ── 2. Classificações (AC 5.1.2) ─────────────────────────────────────
CREATE TABLE public.conversation_classifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id     uuid        NOT NULL REFERENCES public.tracked_conversations(id) ON DELETE CASCADE,
  funnel_stage        text        NOT NULL
                                  CHECK (funnel_stage IN ('awareness','interest','consideration','intent','sale')),
  is_sale             boolean     NOT NULL DEFAULT false,
  sale_value_estimate numeric,
  confidence_score    numeric     NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  classified_at       timestamptz NOT NULL DEFAULT now(),
  model_version       text        NOT NULL,
  reviewed_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  UNIQUE (conversation_id)  -- classificação vigente por conversa (reclassificação = UPDATE)
);

ALTER TABLE public.conversation_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON public.conversation_classifications
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE INDEX cc_review_idx
  ON public.conversation_classifications (workspace_id, confidence_score)
  WHERE reviewed_by IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_classifications TO service_role;
GRANT SELECT, UPDATE ON public.conversation_classifications TO authenticated;  -- 5.4: revisão manual

-- ── 3. classification_status em tracked_conversations (AC 5.1.3) ─────
ALTER TABLE public.tracked_conversations
  ADD COLUMN classification_status text NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'failed'));

-- ── 4. Limiar de confiança (Story 5.6) ───────────────────────────────
-- JÁ EXISTE: workspace_settings.classification_confidence_threshold foi criada
-- na 000000 (initial schema) com default 0.700 e CHECK 0.500–1.000 — exatamente
-- o AC 5.6.2/5.6.5. Nenhuma ação necessária aqui (1º push falhou por duplicá-la;
-- rollback transacional manteve o banco limpo).
