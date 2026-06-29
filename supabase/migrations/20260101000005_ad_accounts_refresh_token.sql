-- ============================================================
-- Migration: 20260101000005_ad_accounts_refresh_token  (logical number 000005)
-- Purpose: Garante a coluna ad_accounts.encrypted_refresh_token
--          (Story 2.2 — Conexão de Contas Google Ads via OAuth, AC 2.2.1)
-- Depende de: 000004 (cria a tabela ad_accounts)
--
-- Notas de implementação (Dex / @dev):
--  - A coluna `encrypted_refresh_token text` JÁ FOI criada na migration 000004
--    (Story 2.1), pois a tabela ad_accounts foi definida com seu schema autoritativo
--    completo. Esta migration usa ADD COLUMN IF NOT EXISTS e portanto é um NO-OP
--    idempotente quando 000004 já foi aplicada — existe para satisfazer o AC 2.2.1
--    explicitamente e para ambientes onde 000004 tenha sido aplicada antes da coluna
--    ser incorporada ao DDL.
--  - A coluna permanece NULL para contas Meta. Para contas Google ela é obrigatória,
--    mas a obrigatoriedade é imposta na APLICAÇÃO (callback OAuth), não no banco,
--    para não afetar contas Meta existentes (AC 2.2.1).
--  - RLS já está ativa desde 000004; não precisa ser reativada.
-- ============================================================

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token text;
