'use client'

import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useLayoutStore } from '@/stores/useLayoutStore'

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clientes',
  '/whatsapp': 'WhatsApp',
  '/conversions': 'Conversões',
  '/reports': 'Relatórios',
  '/ai': 'Assistente IA',
  '/settings': 'Configurações',
}

function resolveLabel(pathname: string): string {
  const match = Object.keys(routeLabels).find((href) =>
    pathname.startsWith(href)
  )
  return match ? routeLabels[match] : 'Advezo'
}

interface TopBarProps {
  actions?: React.ReactNode
}

export function TopBar({ actions }: TopBarProps) {
  const pathname = usePathname()
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const label = resolveLabel(pathname)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Alternar menu"
        className="flex size-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
      </nav>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
