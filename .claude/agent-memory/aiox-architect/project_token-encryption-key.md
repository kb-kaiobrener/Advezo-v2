---
name: project-token-encryption-key
description: Canonical env var for AES-256-GCM ad-account token encryption is TOKEN_ENCRYPTION_KEY (not AD_ACCOUNT_ENCRYPTION_KEY)
metadata:
  type: project
---

The canonical env var for ad-account OAuth token encryption (AES-256-GCM, NFR-1) is **`TOKEN_ENCRYPTION_KEY`** — 32 bytes / 64 hex chars. Implemented in `packages/utils/src/crypto.ts` (`encryptToken`/`decryptToken`).

**Why:** During Epic 2 PC-02 (2026-06-26), `.env.example` had an inconsistent `AD_ACCOUNT_ENCRYPTION_KEY` while `docs/architecture.md` Section 14 (Railway worker vars) and Section 16 (Security) used `TOKEN_ENCRYPTION_KEY`. Standardized on `TOKEN_ENCRYPTION_KEY` to match the architecture and the task spec. The old name was removed from `.env.example`.

**How to apply:** When writing Story 2.1/2.2 (OAuth + token storage) or any code reading the encryption key, use `process.env.TOKEN_ENCRYPTION_KEY`. The key MUST differ per environment (NFR-7) and never appear in `NEXT_PUBLIC_*`. Persisted ciphertext format is `<iv_hex>:<authTag_hex>:<ciphertext_hex>`. See [[project-epic2-sandbox-strategy]].
