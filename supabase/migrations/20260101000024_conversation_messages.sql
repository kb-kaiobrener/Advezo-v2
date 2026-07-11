-- ============================================================
-- Migration: 20260101000024_conversation_messages  (logical 000024)
-- Purpose: Epic 5 Wave 3 — armazenamento do conteúdo de mensagens de conversas
--          TRACKED, pré-requisito do classificador (AC 5.3.2: "histórico de
--          mensagens da conversa"). Gap de design identificado na Wave 3.
--
-- DECISÕES DE DESIGN (respondendo aos 3 pontos de revisão):
--  1. RETENÇÃO (LGPD, AC 5.3.9): entregue JUNTO — cron /api/cron/cleanup-messages
--     (diário, guard CRON_SECRET, service role) faz DELETE WHERE message_at <
--     now() - interval '90 days'. Índice em message_at cobre o DELETE.
--  2. CIFRAGEM EM REPOUSO: content_encrypted usa AES-256-GCM com
--     TOKEN_ENCRYPTION_KEY (helper encryptToken de @advezo/utils) — MESMO padrão
--     de encrypted_token (OAuth, Epic 2) e email_encrypted (Story 8.3). Conteúdo
--     integral de conversa é dado pessoal sensível; texto puro foi rejeitado.
--     O classificador (service role, tem a chave) decripta EM MEMÓRIA ao montar
--     o prompt; nada decriptado é persistido.
--  3. ACESSO DA 5.4 (trecho na revisão manual): NENHUM grant para authenticated
--     — ciphertext seria inútil e criaria hábito de acesso direto. O trecho é
--     servido por server action com service role + checagem de membership,
--     decriptando server-side (mesmo padrão do dashboard 3.7/painel 3.8).
--     Nenhuma migration futura necessária para a 5.4.
--
--  RLS habilitada SEM policies = deny-all para qualquer role que não seja
--  service_role (que bypassa RLS) — defesa em profundidade além da ausência
--  de grants.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.conversation_messages;
--   (remover também o cron cleanup-messages do vercel.json)
-- ============================================================

CREATE TABLE public.conversation_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id   uuid        NOT NULL REFERENCES public.tracked_conversations(id) ON DELETE CASCADE,
  direction         text        NOT NULL CHECK (direction IN ('in', 'out')),
  content_encrypted text        NOT NULL,  -- AES-256-GCM (iv:tag:ciphertext) via TOKEN_ENCRYPTION_KEY
  message_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
-- sem policies: deny-all para authenticated/anon (service_role bypassa RLS)

-- histórico por conversa (classificador) e retenção (cleanup por message_at)
CREATE INDEX conversation_messages_conv_idx
  ON public.conversation_messages (conversation_id, message_at);
CREATE INDEX conversation_messages_retention_idx
  ON public.conversation_messages (message_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_messages TO service_role;
-- NENHUM grant para authenticated/anon — acesso só via server action (decisão 3)
