'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createWorkspace } from '@/app/actions/workspace'

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('refresh') !== '1') return

    setIsRefreshing(true)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.refreshSession().then(({ data }) => {
      if (data?.session?.user?.user_metadata?.workspace_id) {
        window.location.href = '/dashboard'
      } else {
        setIsRefreshing(false)
        router.replace('/onboarding')
      }
    })
  }, [router])

  if (isRefreshing) return <div>Carregando...</div>

  async function handleCreate(formData: FormData) {
    setError(null)
    setIsPending(true)
    const result = await createWorkspace(formData)
    setIsPending(false)
    if (result?.error) setError(result.error)
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
