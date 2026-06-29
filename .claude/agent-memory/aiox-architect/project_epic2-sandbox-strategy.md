---
name: project-epic2-sandbox-strategy
description: Epic 2 Meta/Google sandbox strategy lives in docs/architecture.md Section 10; Anthropic sandbox deferred to Epic 5
metadata:
  type: project
---

The official sandbox/integration-test strategy for Epic 2 (Meta Ads + Google Ads OAuth/sync) is documented in **`docs/architecture.md` Section 10 — "Estratégia de Sandbox e Testes de Integração"** (added 2026-06-26, PC-01).

Key points: Meta uses Facebook Developer App (dev mode) + Meta Test Ad Account (`META_TEST_AD_ACCOUNT_ID`, `META_APP_ID`, `META_APP_SECRET`). Google uses an `is_test_account` Google Ads API test account (`GOOGLE_ADS_TEST_CUSTOMER_ID`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`). CI never holds prod creds; integration tests gate on `describe.runIf(hasSandboxCredentials)` mirroring `auth-workspace-id.test.ts`.

**Why:** PRD required @architect to define per-platform sandbox before Epic 2. Anthropic sandbox was explicitly excluded (it belongs to Epic 5).

**How to apply:** When drafting/implementing Stories 2.1–2.4, point to Section 10 for env vars and the anti-production rules. Google Ads production needs Developer Token approval (PC-03, human action, blocks Wave 2 prod). See [[project-token-encryption-key]].
