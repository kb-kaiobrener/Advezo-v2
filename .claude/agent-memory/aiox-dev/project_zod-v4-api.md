---
name: zod-v4-api
description: Zod v4 breaking changes that bite in apps/web — strict .uuid() and 2-arg z.record()
metadata:
  type: project
---

apps/web usa **Zod ^4.4.3**. Duas mudanças do v4 que já causaram falha real:

1. **`z.string().uuid()` valida versão/variante** — rejeita UUIDs "falsos" como `11111111-1111-1111-1111-111111111111`. Em fixtures de teste use um UUID v4 válido (ex: `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`).
2. **`z.record()` agora exige 2 argumentos** (key type + value type): `z.record(z.string(), z.unknown())`. `z.record(z.unknown())` quebra o typecheck com TS2554.

**Why:** descoberto na Story 8.2 (fixture com UUID inválido fazia o teste 422 do POST falhar com "client_id inválido" em vez da mensagem LGPD). O erro de `z.record` apareceu no typecheck de `lib/validation/lead-submit.ts` (Story 8.3).

**How to apply:** ao escrever schemas Zod ou fixtures em apps/web, assuma a API v4. Antes de culpar a lógica de validação, cheque se um `.uuid()` ou `z.record(...)` está na cadeia de issues.
