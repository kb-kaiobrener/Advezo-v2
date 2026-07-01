'use client'

import { useEffect } from 'react'

export default function RefreshPage() {
  useEffect(() => {
    // Força reload completo da página para o browser buscar novo JWT
    window.location.href = '/dashboard'
  }, [])

  return <div>Carregando...</div>
}
