-- ============================================================
-- Migration: 20260101000017_epic2_grants_service_role  (logical number 000017)
-- Purpose: Corrigir lacuna de GRANTs para service_role nas tabelas do Epic 2
--          (ad_accounts, ad_campaigns, campaign_metrics, alerts).
--          Descoberto no QA gate da Wave 4 (Story 3.6 BLOCK-002 / Story 3.5 GRANT-001).
--
-- Contexto:
--  - Os crons server-side (send-reports via generateReport; send-alerts) usam
--    createSupabaseServiceClient() (service_role, ignora RLS) para ler/escrever
--    essas tabelas. Sem GRANT explícito, o PostgREST retorna 403 permission denied
--    ("GRANT SELECT ON public.<table> TO service_role").
--  - Precedente idêntico: migration 000011 (whatsapp_accounts_grants) foi um hotfix
--    da mesma classe para whatsapp_accounts.
--  - Tabelas criadas nas migrations 000004/000006/000008 não receberam grants
--    explícitos e as default privileges do projeto não cobrem service_role de forma
--    confiável (workspaces/clients funcionam por herança, ad_accounts/alerts não).
--
-- Escopo dos privilégios:
--  - alerts: SELECT + UPDATE são obrigatórios (cron send-alerts faz claim atômico
--    UPDATE ... WHERE whatsapp_sent_at IS NULL e rollback). INSERT/DELETE incluídos
--    por consistência com o cron de detecção (Story 2.9).
--  - ad_accounts, ad_campaigns, campaign_metrics: leitura pelo generateReport e pelo
--    embed de send-alerts; INSERT/UPDATE já usados pelo sync pipeline (Epic 2).
--
-- Idempotência: GRANT é idempotente no Postgres (reaplicar não gera erro).
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_accounts      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts           TO service_role;
