import type { ReactNode } from 'react'

export default function ClienteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
    </div>
  )
}
