# AIOX Dev Agent Memory

- [Web test cleanup](project_web-test-cleanup.md) — apps/web vitest has no auto RTL cleanup; component tests with duplicate text need afterEach(cleanup)
- [ad_accounts schema](project_ad-accounts-schema.md) — authoritative schema from Story 2.1: account_name (not name), no deleted_at, status-based lifecycle, act_ prefix, set_updated_at() trigger
- [Cron service-role gap](project_cron-service-role-gap.md) — RESOLVED in Story 2.4 (ARCH-1): createSupabaseServiceClient() added to @advezo/database; both sync crons use it via DI
