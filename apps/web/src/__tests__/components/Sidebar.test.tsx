import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let mockPathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@advezo/database/browser', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { email: 'dex@advezo.dev' } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
}))

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: (selector: (s: { workspaceName: string }) => unknown) =>
    selector({ workspaceName: 'Agência XYZ' }),
}))

// Imported after mocks are registered.
import { Sidebar } from '@/components/layout/Sidebar'
import { useLayoutStore } from '@/stores/useLayoutStore'

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Sidebar />
    </QueryClientProvider>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockPathname = '/dashboard'
    useLayoutStore.setState({ sidebarOpen: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('renderiza 6 nav items + Configurações (7 links de navegação)', () => {
    const { getByRole } = renderSidebar()
    const labels = [
      'Dashboard',
      'Clientes',
      'WhatsApp',
      'Conversões',
      'Relatórios',
      'Assistente IA',
      'Configurações',
    ]
    labels.forEach((label) => {
      expect(getByRole('link', { name: label })).toBeTruthy()
    })
  })

  it('aplica bg-brand-100 no item ativo quando o pathname corresponde', () => {
    mockPathname = '/clients'
    const { getByRole } = renderSidebar()
    const clientesLink = getByRole('link', { name: 'Clientes' })
    expect(clientesLink.className).toContain('bg-brand-100')
    expect(clientesLink.className).toContain('text-brand-700')

    const dashboardLink = getByRole('link', { name: 'Dashboard' })
    expect(dashboardLink.className).not.toContain('bg-brand-100')
  })

  it('o botão de toggle alterna sidebarOpen no store', () => {
    const { getByRole } = renderSidebar()
    expect(useLayoutStore.getState().sidebarOpen).toBe(true)
    fireEvent.click(getByRole('button', { name: 'Recolher menu' }))
    expect(useLayoutStore.getState().sidebarOpen).toBe(false)
  })
})
