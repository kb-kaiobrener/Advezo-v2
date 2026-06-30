import { z } from 'zod'

/**
 * Validação server-side do body de POST /api/leads/submit (Story 8.3 — AC 8.3.8).
 *
 * Endpoint PÚBLICO (embed em landing page de cliente): não há JWT, a autenticação é o
 * `embed_token`. Toda entrada é não-confiável → validação estrita com Zod antes de
 * qualquer processamento.
 *
 * Regras de campo:
 *  - name:        string obrigatória.
 *  - phone:       WhatsApp BR — `+55` + DDD (2) + 8 ou 9 dígitos. Aceita máscara
 *                 (espaços, parênteses, hífen) — a normalização E.164 ocorre no servidor
 *                 via normalizePhone() de @advezo/utils.
 *  - embed_token: string obrigatória (identifica o lead_form).
 *  - email:       email opcional. SE presente, o gate de consentimento (AC 8.3.3) exige
 *                 consent === true ANTES de qualquer processamento — esse gate vive na
 *                 route, não aqui, porque a resposta é 422 com mensagem LGPD específica.
 *  - consent:     boolean opcional.
 *  - field_data:  objeto opcional com campos customizados do formulário.
 *
 * Campos inválidos → a route responde 422 com `error.flatten()` (detalhes por campo).
 */

/**
 * WhatsApp BR: opcional `+`, `55`, DDD (2 dígitos), e 8 ou 9 dígitos de número.
 * A máscara é removida antes do teste (espaços, parênteses, hífen, pontos).
 * Exemplos válidos: `+5511998765432`, `5511998765432`, `+55 (11) 99876-5432`.
 */
const WHATSAPP_BR_REGEX = /^\+?55\d{2}\d{8,9}$/

export const leadSubmitSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  phone: z
    .string()
    .min(1, 'Telefone obrigatório')
    .refine(
      (value) => WHATSAPP_BR_REGEX.test(value.replace(/[\s().-]/g, '')),
      'Telefone deve estar no formato WhatsApp BR (+55 + DDD + 8 ou 9 dígitos)'
    ),
  embed_token: z.string().min(1, 'embed_token obrigatório'),
  email: z.string().email('Email inválido').optional(),
  consent: z.boolean().optional(),
  field_data: z.record(z.string(), z.unknown()).optional(),
})

export type LeadSubmitInput = z.infer<typeof leadSubmitSchema>
