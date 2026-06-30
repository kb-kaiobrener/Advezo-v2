# AIOX Dev Agent Memory

- [Web test cleanup](project_web-test-cleanup.md) — apps/web vitest has no auto RTL cleanup; component tests with duplicate text need afterEach(cleanup)
- [ad_accounts schema](project_ad-accounts-schema.md) — authoritative schema from Story 2.1: account_name (not name), no deleted_at, status-based lifecycle, act_ prefix, set_updated_at() trigger
- [Cron service-role gap](project_cron-service-role-gap.md) — RESOLVED in Story 2.4 (ARCH-1): createSupabaseServiceClient() added to @advezo/database; both sync crons use it via DI
- [Zod v4 API](project_zod-v4-api.md) — apps/web on Zod ^4.4.3: .uuid() validates version (rejects fake UUIDs), z.record() needs 2 args
- [Leads public endpoint](project_leads-public-endpoint.md) — Story 8.3 patterns for Epic 8 public endpoints: service-role client, workspace_id-as-salt HMAC, field_data._ip rate limit, consent-conditional crypto, CAPI stub
- [Meta webhook endpoint](project_meta-webhook-endpoint.md) — Story 8.5 patterns for server-to-server webhooks: raw-body HMAC, timingSafeEqual length-guard, CORS closed, queue 23505 dedup idempotent (200 ACK), ad_accounts.external_account_id mapping
- [CAPI leads dispatch](project_capi-leads-dispatch.md) — Story 8.7 CAPI: no meta_conversions_api_enabled col (select * + defensive read), no conversion_events table (guard via PGRST205), token from ad_accounts, lead.ts compat layer
- [Leads dual legal basis](project_leads_dual_legal_basis.md) — Epic 8 leads: 2 bases legais por source; consent_given_at NULL em lead_ads é correto, não bug; 3 padrões hash/cripto distintos
