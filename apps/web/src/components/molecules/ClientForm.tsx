'use client'

import { useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { ClientSchema, type ClientFormData } from '@/lib/schemas/clients'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ClientFormProps {
  defaultValues?: Partial<ClientFormData>
  onSubmit: (data: ClientFormData) => Promise<{ error?: string } | void>
  submitLabel?: string
}

export function ClientForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Salvar',
}: ClientFormProps) {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ClientFormData>({
    resolver: zodResolver(ClientSchema),
    defaultValues: {
      name: '',
      document: '',
      contact_email: '',
      contact_phone: '',
      ...defaultValues,
    },
  })

  function handleSubmit(data: ClientFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await onSubmit(data)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Ex: Agência Crescimento"
                  aria-invalid={!!form.formState.errors.name}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="document"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CNPJ / CPF</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Opcional"
                  aria-invalid={!!form.formState.errors.document}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email de contato</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  placeholder="contato@empresa.com.br"
                  aria-invalid={!!form.formState.errors.contact_email}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact_phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone de contato</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  placeholder="(11) 99999-9999"
                  aria-invalid={!!form.formState.errors.contact_phone}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className={cn(buttonVariants())}
          >
            {isPending ? 'Salvando...' : submitLabel}
          </button>
          <Link href="/clients" className={cn(buttonVariants({ variant: 'outline' }))}>
            Cancelar
          </Link>
        </div>
      </form>
    </Form>
  )
}
