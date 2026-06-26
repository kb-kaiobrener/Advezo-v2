import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '@/stores/useLayoutStore'
import { useActiveClientStore } from '@/stores/useActiveClientStore'
import { useActiveAdAccountStore } from '@/stores/useActiveAdAccountStore'

describe('useLayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarOpen: true })
  })

  it('toggleSidebar alterna o booleano', () => {
    expect(useLayoutStore.getState().sidebarOpen).toBe(true)
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarOpen).toBe(false)
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarOpen).toBe(true)
  })

  it('setSidebarOpen define o valor explicitamente', () => {
    useLayoutStore.getState().setSidebarOpen(false)
    expect(useLayoutStore.getState().sidebarOpen).toBe(false)
  })
})

describe('useActiveClientStore', () => {
  beforeEach(() => {
    useActiveClientStore.setState({
      activeClientId: null,
      activeClientName: null,
    })
  })

  it('setActiveClient popula id e name', () => {
    useActiveClientStore.getState().setActiveClient('c1', 'Cliente Um')
    expect(useActiveClientStore.getState().activeClientId).toBe('c1')
    expect(useActiveClientStore.getState().activeClientName).toBe('Cliente Um')
  })

  it('clearActiveClient zera para null', () => {
    useActiveClientStore.getState().setActiveClient('c1', 'Cliente Um')
    useActiveClientStore.getState().clearActiveClient()
    expect(useActiveClientStore.getState().activeClientId).toBeNull()
    expect(useActiveClientStore.getState().activeClientName).toBeNull()
  })
})

describe('useActiveAdAccountStore', () => {
  beforeEach(() => {
    useActiveAdAccountStore.setState({
      activeAdAccountId: null,
      activeAdAccountName: null,
      platform: null,
    })
  })

  it('setActiveAdAccount popula id, name e platform', () => {
    useActiveAdAccountStore
      .getState()
      .setActiveAdAccount('a1', 'Conta Meta', 'meta')
    const state = useActiveAdAccountStore.getState()
    expect(state.activeAdAccountId).toBe('a1')
    expect(state.activeAdAccountName).toBe('Conta Meta')
    expect(state.platform).toBe('meta')
  })

  it('clearActiveAdAccount zera para null', () => {
    useActiveAdAccountStore
      .getState()
      .setActiveAdAccount('a1', 'Conta Meta', 'meta')
    useActiveAdAccountStore.getState().clearActiveAdAccount()
    const state = useActiveAdAccountStore.getState()
    expect(state.activeAdAccountId).toBeNull()
    expect(state.activeAdAccountName).toBeNull()
    expect(state.platform).toBeNull()
  })
})
