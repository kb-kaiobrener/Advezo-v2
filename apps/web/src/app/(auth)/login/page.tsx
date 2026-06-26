'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signInWithEmail, signInWithMagicLink } from '@/app/actions/auth'

export default function LoginPage() {
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handlePasswordLogin(formData: FormData) {
    setError(null)
    setIsPending(true)
    const result = await signInWithEmail(formData)
    setIsPending(false)
    if (result?.error) setError(result.error)
  }

  async function handleMagicLink(formData: FormData) {
    setError(null)
    setIsPending(true)
    const result = await signInWithMagicLink(formData)
    setIsPending(false)
    if (result?.error) setError(result.error)
    else if (result?.success) setMagicLinkSent(true)
  }

  if (magicLinkSent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link enviado!</CardTitle>
          <CardDescription>Verifique seu email e clique no link para entrar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar no Advezo</CardTitle>
        <CardDescription>Acesse sua conta para continuar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
        )}
        <form action={handlePasswordLogin} className="space-y-3">
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

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">ou</span>
          </div>
        </div>

        <form action={handleMagicLink} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="magic-email">Email (link mágico)</Label>
            <Input id="magic-email" name="email" type="email" required placeholder="seu@email.com" />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
            Enviar link de acesso
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Não tem conta?{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
