'use client'

import { create } from 'zustand'

interface ActiveClientState {
  activeClientId: string | null
  activeClientName: string | null
  setActiveClient: (id: string, name: string) => void
  clearActiveClient: () => void
}

export const useActiveClientStore = create<ActiveClientState>()((set) => ({
  activeClientId: null,
  activeClientName: null,
  setActiveClient: (id, name) =>
    set({ activeClientId: id, activeClientName: name }),
  clearActiveClient: () =>
    set({ activeClientId: null, activeClientName: null }),
}))
