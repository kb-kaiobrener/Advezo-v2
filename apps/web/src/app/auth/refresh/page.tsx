'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@advezo/database/browser'

export default function RefreshPage() {
  const router = useRouter()

  useEffect(() => {
    async function refresh() {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.refreshSession()
      router.push('/dashboard')
    }
    refresh()
  }, [router])

  return <div>Carregando...</div>
}
