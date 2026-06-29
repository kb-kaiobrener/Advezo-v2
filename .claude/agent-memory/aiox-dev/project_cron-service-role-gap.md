---
name: cron-service-role-gap
description: RESOLVED in Story 2.4 (ARCH-1) — @advezo/database now has createSupabaseServiceClient() and both sync crons use it via DI
metadata:
  type: project
---

RESOLVED in Story 2.4 (ARCH-1). `@advezo/database` now exports `createSupabaseServiceClient()` (`./service`), a service-role client (SUPABASE_SERVICE_ROLE_KEY, ignores RLS, persistSession:false). Both `POST /api/sync/meta` and `POST /api/sync/google` use it to list accounts AND inject it into `syncMetaAccount`/`syncGoogleAccount` (both now take an optional `supabaseClient?` 3rd arg — DI). URL falls back from `SUPABASE_URL` to `NEXT_PUBLIC_SUPABASE_URL`.

**Why it mattered:** Railway cron sends no user session → no JWT → RLS `workspace_id = auth_workspace_id()` blocked all cron writes silently. The manual Server Action path (`syncMetaAccountNow`/`syncGoogleAccountNow`) runs with the user session and uses the cookie-based default client — unchanged.

**Residual follow-up (not blocking):** `refreshGoogleToken` (Story 2.2) still persists the refreshed token via its own internal cookie-based client; on the cron path that internal write is RLS-blocked, but the function returns the encrypted token used in-memory for the retry, so the sync succeeds and the token re-persists on the next session-backed sync. Parametrizing `refreshGoogleToken` to accept the service client is a possible future improvement (would change its 2.2 interface/tests). See [[ad-accounts-schema]].
