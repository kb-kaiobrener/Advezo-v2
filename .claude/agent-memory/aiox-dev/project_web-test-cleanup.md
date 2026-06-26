---
name: web-test-cleanup
description: apps/web vitest has no automatic RTL cleanup — component tests rendering the same text twice need explicit afterEach(cleanup)
metadata:
  type: project
---

In `apps/web`, the vitest config (`apps/web/vitest.config.ts`) uses `globals: false` and registers **no setup file**, so React Testing Library's auto-cleanup is NOT active. Rendered DOM accumulates across `it()` blocks in the same file.

**Why:** A component test that renders the same visible text in multiple cases (e.g. `StatusBadge` showing "Crítico" for several health scores) will fail with `TestingLibraryElementError: Found multiple elements with the text`.

**How to apply:** When writing component tests in `apps/web/src/__tests__/components/`, add `import { cleanup } from '@testing-library/react'` and `afterEach(cleanup)` at the top of the file. Existing tests (e.g. StatusBadge.test.tsx) only avoid this because each render queries a unique label. Do not edit the shared vitest config to fix this unless explicitly in scope.
