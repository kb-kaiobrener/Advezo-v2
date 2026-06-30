---
name: pnpm-exotic-subdeps
description: pnpm 11 lê blockExoticSubdeps de pnpm-workspace.yaml, NÃO de .npmrc (chave ignorada). Necessário p/ Baileys (libsignal via git).
metadata:
  type: project
---

No monorepo advezo v2 (pnpm 11.9), permitir dependências exóticas (git-resolved) requer `blockExoticSubdeps: false` em `pnpm-workspace.yaml` (camelCase).

**Why:** `@whiskeysockets/baileys` resolve `libsignal` e `@whiskeysockets/eslint-config` via git-repository. pnpm 11 bloqueia por padrão com `[ERR_PNPM_EXOTIC_SUBDEP]`. A chave kebab-case `block-exotic-subdeps=false` no `.npmrc` é **silenciosamente ignorada** pelo pnpm 11 — `pnpm config get block-exotic-subdeps` retorna `undefined`. Settings desse tipo migraram para `pnpm-workspace.yaml` no pnpm 11.

**How to apply:** Ao instalar deps que puxam subdeps git-resolved, configure em `pnpm-workspace.yaml`, não `.npmrc`. Aprovado globalmente pelo usuário (2026-06-30, Story 3.1) — pnpm não oferece allowlist por-pacote. Build scripts de subdeps (ex: `protobufjs` do Baileys) vão em `allowBuilds:` no mesmo arquivo. Ver [[whatsapp-worker-schema]].
