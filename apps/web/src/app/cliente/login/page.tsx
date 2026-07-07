'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signInCliente } from '@/app/actions/cliente-auth'

export default function ClienteLoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleLogin(formData: FormData) {
    setError(null)
    setIsPending(true)
    const result = await signInCliente(formData)
    setIsPending(false)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <Card>
        <CardHeader>
          <CardTitle>Painel do Cliente</CardTitle>
          <CardDescription>Entre com o acesso enviado pela sua agência</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <form action={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            Recebeu um convite? Use o link do email para definir sua senha.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
