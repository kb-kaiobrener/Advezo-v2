import { z } from 'zod'

export const ClientSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  document: z.string().optional(),
  contact_email: z
    .string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  contact_phone: z.string().optional(),
})

export type ClientFormData = z.infer<typeof ClientSchema>
