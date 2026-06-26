'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  MessageCircle,
  TrendingUp,
  BarChart2,
  BrainCircuit,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@advezo/database/browser'
import { useLayoutStore } from '@/stores/useLayoutStore'
import { useWorkspaceStore } from '@/stores/workspace'
import { cn } from '@/lib/utils'
import { ClientSelector } from './ClientSelector'
import { AdAccountSelector } from './AdAccountSelector'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/conversions', label: 'Conversões', icon: TrendingUp },
  { href: '/reports', label: 'Relatórios', icon: BarChart2 },
  { href: '/ai', label: 'Assistente IA', icon: BrainCircuit },
]

const settingsItem: NavItem = {
  href: '/settings',
  label: 'Configurações',
  icon: Settings,
}

function getInitials(value: string | null | undefined): string {
  if (!value) return '?'
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface NavLinkProps {
  item: NavItem
  collapsed: boolean
  active: boolean
}

function NavLink({ item, collapsed, active }: NavLinkProps) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-brand-100 text-brand-700'
          : 'text-gray-600 hover:bg-gray-50'
      )}
    >
      <Icon className={cn('size-5 shrink-0', active && 'text-brand-600')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)

  const workspaceName = useWorkspaceStore((s) => s.workspaceName)

  const [menuOpen, setMenuOpen] = useState(false)
  const [userLabel, setUserLabel] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Collapse sidebar on small viewports (AC 1.5.8).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  // Load the current user's display label for the avatar.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) return
      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email ??
        null
      setUserLabel(name)
    })
  }, [])

  // Close the avatar dropdown when clicking outside.
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const collapsed = !sidebarOpen

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      role="navigation"
      aria-label="Navegação principal"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Header: logo + collapse toggle */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <span className="text-base font-semibold text-foreground">
            Advezo
          </span>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>

      {/* Workspace + selectors */}
      {!collapsed && (
        <div className="space-y-3 border-b border-border px-3 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="truncate text-sm font-medium text-foreground">
              {workspaceName ?? 'Workspace'}
            </p>
          </div>
          <ClientSelector />
          <AdAccountSelector />
        </div>
      )}

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={pathname.startsWith(item.href)}
          />
        ))}

        <div className="my-2 border-t border-border" />

        <NavLink
          item={settingsItem}
          collapsed={collapsed}
          active={pathname.startsWith(settingsItem.href)}
        />
      </nav>

      {/* Avatar + dropdown */}
      <div ref={menuRef} className="relative border-t border-border p-2">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Menu do usuário"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50',
            collapsed && 'justify-center px-0'
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-medium text-white">
            {getInitials(userLabel)}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left text-foreground">
                {userLabel ?? 'Usuário'}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
          >
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Settings className="size-4" />
              Configurações
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
