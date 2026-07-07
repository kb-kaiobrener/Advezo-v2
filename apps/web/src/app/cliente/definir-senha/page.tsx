'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@advezo/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { markClientInviteAccepted } from '@/app/actions/cliente-auth'

/**
 * Destino do link de convite (Story 3.8, AC 3.8.1).
 * O link do Supabase chega com o token na URL; o browser client estabelece a
 * sessão automaticamente (detectSessionInUrl). Aqui o cliente define a senha,
 * o convite é marcado como aceito e ele segue para /cliente.
 */
export default function DefinirSenhaPage() {
  const router = useRouter()
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
      else setError('Link inválido ou expirado — peça um novo convite à sua agência.')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = new FormData(e.currentTarget)
    const password = form.get('password') as string
    const confirm = form.get('confirm') as string

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }

    setIsPending(true)
    const supabase = createSupabaseBrowserClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setIsPending(false)
      setError('Não foi possível definir a senha — tente novamente.')
      return
    }

    await markClientInviteAccepted()
    router.replace('/cliente')
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <Card>
        <CardHeader>
          <CardTitle>Definir senha</CardTitle>
          <CardDescription>Crie sua senha de acesso ao painel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="password">Nova senha</Label>
              <Input id="password" name="password" type="password" required minLength={8} disabled={!sessionReady} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input id="confirm" name="confirm" type="password" required minLength={8} disabled={!sessionReady} />
            </div>
            <Button type="submit" className="w-full" disabled={!sessionReady || isPending}>
              {isPending ? 'Salvando...' : 'Salvar e entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
