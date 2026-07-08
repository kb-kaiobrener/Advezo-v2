'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
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
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      // refreshSession força novo access token — o hook injeta workspace_id no JWT.
      // Fix TD-005: o claim vive no TOKEN (getClaims), não em session.user.user_metadata
      // (que reflete o banco e nunca recebe o claim).
      const { error } = await supabase.auth.refreshSession()
      const { data: claimsData } = await supabase.auth.getClaims()
      console.log('refresh result:', {
        workspaceId: claimsData?.claims?.user_metadata?.workspace_id,
        error: error?.message
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
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
        <form onSubmit={(e) => { e.preventDefault(); handleCreate(new FormData(e.currentTarget)) }} className="space-y-4">
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
