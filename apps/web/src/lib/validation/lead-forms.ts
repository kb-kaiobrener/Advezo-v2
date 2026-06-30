import { z } from 'zod'

/**
 * Validação server-side de lead_forms (Story 8.2 — AC 8.2.3 / 8.2.5).
 *
 * Reutilizada nas API routes (POST e PUT). O foco crítico é a regra LGPD:
 * se o formulário coleta email, DEVE haver um consent_checkbox vinculado ao email.
 *
 * O enum de `type` segue exatamente o tipo `LeadFormField` de @advezo/types e o
 * schema da tabela (Story 8.1): text | phone | email | consent_checkbox | select.
 */

const fieldTypeEnum = z.enum([
  'text',
  'phone',
  'email',
  'consent_checkbox',
  'select',
])

export const leadFormFieldSchema = z.object({
  id: z.string().min(1),
  type: fieldTypeEnum,
  label: z.string().min(1),
  required: z.boolean(),
  fixed: z.boolean().optional(),
  linked_field: z.string().optional(),
  options: z.array(z.string()).optional(),
})

/**
 * Regra LGPD (AC 8.2.3): se algum campo é `type:'email'`, deve existir exatamente um
 * `type:'consent_checkbox'` com `linked_field:'email'`. A mensagem é literal e
 * verificada em teste — não alterar sem atualizar o teste correspondente.
 */
export const leadFormFieldsSchema = z
  .array(leadFormFieldSchema)
  .superRefine((fields, ctx) => {
    const hasEmail = fields.some((f) => f.type === 'email')
    const hasConsentForEmail = fields.some(
      (f) => f.type === 'consent_checkbox' && f.linked_field === 'email'
    )
    if (hasEmail && !hasConsentForEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Formulário com campo email requer consent_checkbox vinculado (LGPD Art. 7º I)',
      })
    }
  })

const qualificationRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'not_eq', 'contains', 'filled', 'not_filled']),
  value: z.string().nullable(),
})

/** Schema de criação (POST). `client_id` obrigatório (AC 8.2.2). */
export const createLeadFormSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  client_id: z.string().uuid('client_id inválido'),
  ad_account_id: z.string().uuid().nullable().optional(),
  fields: leadFormFieldsSchema.optional().default([]),
  qualification_rules: z.array(qualificationRuleSchema).optional().default([]),
  allowed_origins: z.array(z.string()).nullable().optional(),
})

/** Schema de atualização (PUT). Todos os campos opcionais (atualização parcial). */
export const updateLeadFormSchema = z.object({
  name: z.string().min(1).optional(),
  client_id: z.string().uuid().nullable().optional(),
  ad_account_id: z.string().uuid().nullable().optional(),
  fields: leadFormFieldsSchema.optional(),
  qualification_rules: z.array(qualificationRuleSchema).optional(),
  allowed_origins: z.array(z.string()).nullable().optional(),
})

export type CreateLeadFormSchema = z.infer<typeof createLeadFormSchema>
export type UpdateLeadFormSchema = z.infer<typeof updateLeadFormSchema>
