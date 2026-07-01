'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshPage() {
  const [status, setStatus] = useState('iniciando')
  const router = useRouter()

  useEffect(() => {
    setStatus('useEffect executou')

    const go = async () => {
      try {
        setStatus('importando supabase')
        const { createClient } = await import('@supabase/supabase-js')
        setStatus('criando client')
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        setStatus('refreshing session')
        const { data, error } = await supabase.auth.refreshSession()
        setStatus(`done: workspace=${data?.session?.user?.user_metadata?.workspace_id}, error=${error?.message}`)
        setTimeout(() => router.push('/dashboard'), 2000)
      } catch (e: unknown) {
        setStatus(`erro: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    go()
  }, [router])

  return (
    <div style={{ padding: 20 }}>
      <p>Status: {status}</p>
    </div>
  )
}
