'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@advezo/database/browser'

export default function RefreshPage() {
  const router = useRouter()

  useEffect(() => {
    async function refresh() {
      console.log('RefreshPage: iniciando...')
      const supabase = createSupabaseBrowserClient()
      console.log('RefreshPage: supabase client criado')
      const { data, error } = await supabase.auth.refreshSession()
      console.log('RefreshPage: refreshSession completo', {
        hasSession: !!data?.session,
        workspaceId: data?.session?.user?.user_metadata?.workspace_id,
        error: error?.message
      })
      console.log('RefreshPage: redirecionando para /dashboard')
      router.push('/dashboard')
    }
    refresh()
  }, [router])

  return <div>Carregando...</div>
}
