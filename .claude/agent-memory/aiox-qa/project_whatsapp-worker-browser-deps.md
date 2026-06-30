---
name: whatsapp-worker-browser-deps
description: electron-to-chromium no dep tree do whatsapp-worker é falso-positivo de browser scan (Epic 3 / Story 3.1)
metadata:
  type: project
---

Ao escanear `apps/whatsapp-worker/` por dependências de browser (AC 3.1.1 / 3.1.9 — Baileys substitui Puppeteer), o pnpm-lock.yaml mostra `electron-to-chromium`. **NÃO é um falso negativo do gate:** é um pacote data-only do Browserslist (tabelas de compatibilidade), sem binário Chromium, puxado transitivamente. Não é Puppeteer/Chromium-binary/whatsapp-web.js.

**Why:** O objetivo central do Epic 3 é remover browser headless do worker para estabilidade no Railway. Um scan ingênuo por "chromium" gera alarme falso e pode bloquear o gate indevidamente.

**How to apply:** Em QA gates futuros do whatsapp-worker, ao ver "chromium" no scan, verificar se a única ocorrência é `electron-to-chromium` / `@playwright/test` (peer de outro pacote do monorepo, não do worker) antes de marcar FAIL. Confirmar com `pnpm --filter @advezo/whatsapp-worker list --depth N`. Relacionado: [[whatsapp-worker-schema]] (divergência architecture.md, delegada a @architect).
