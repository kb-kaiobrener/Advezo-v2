---
name: supabase-client-factories
description: '@advezo/database exports only cookie-based server + browser clients; no service-role factory exists — relevant to any cron/background/RLS-bypass path'
metadata:
  type: project
---

`@advezo/database` (packages/database/src/index.ts) exports exactly two factories: `createSupabaseServerClient` (cookie-based, ANON_KEY, reads `next/headers` cookies) and `createSupabaseBrowserClient`. There is NO `createSupabaseServiceClient` / service-role factory as of Story 2.3 (Epic 2, Wave 2).

The server client uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` and depends on a user JWT in cookies. RLS policies across the schema use `workspace_id = auth_workspace_id()`, which returns NULL when there is no authenticated JWT — so any cookie-less context (Railway cron, background jobs) gets zero rows on reads and silent no-ops on RLS-scoped writes.

The only service-role usage in the repo is a raw `createClient(url, SUPABASE_SERVICE_ROLE_KEY, ...)` from `@supabase/supabase-js` inside `apps/web/src/__tests__/integration/auth-workspace-id.test.ts` — a test helper, NOT a reusable production factory. `SUPABASE_SERVICE_ROLE_KEY` already exists in `.env.example`.

**Why:** Story 2.3's Meta sync cron (`POST /api/sync/meta`) is the first production background job. It calls `syncMetaAccount` which instantiates the cookie-based client internally — so the cron path fails silently under RLS. The manual Server Action path (`syncMetaAccountNow`) works because it runs under the user session.

**How to apply:** When any cron/worker/webhook needs DB writes, first require a `createSupabaseServiceClient()` (service-role, RLS-bypassed) in `@advezo/database`. Prefer dependency injection — pass the client into sync/business functions as a parameter rather than instantiating internally — so both session and service-role contexts can reuse the same logic. See [[epic2-sandbox-strategy]].
