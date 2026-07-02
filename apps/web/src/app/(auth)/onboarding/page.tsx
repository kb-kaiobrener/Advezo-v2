'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createWorkspace } from '@/app/actions/workspace'

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleCreate(formData: FormData) {
    setError(null)
    setIsPending(true)

    const result = await createWorkspace(formData)

    if (result?.error) {
      setIsPending(false)
      setError(result.error)
      return
    }

    if (result?.success) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      await supabase.auth.refreshSession()
      window.location.href = '/dashboard'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bem-vindo ao Advezo</CardTitle>
        <CardDescription>Crie seu workspace para começar a gerenciar suas campanhas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
        )}
        <form action={handleCreate} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Nome do workspace</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Ex: Agência Crescimento"
            />
            <p className="text-xs text-gray-500">Pode ser o nome da sua agência ou empresa</p>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Criando workspace...' : 'Criar workspace e continuar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
