'use client'

import { create } from 'zustand'

type AdPlatform = 'meta' | 'google'

interface ActiveAdAccountState {
  activeAdAccountId: string | null
  activeAdAccountName: string | null
  platform: AdPlatform | null
  setActiveAdAccount: (id: string, name: string, platform: AdPlatform) => void
  clearActiveAdAccount: () => void
}

export const useActiveAdAccountStore = create<ActiveAdAccountState>()((set) => ({
  activeAdAccountId: null,
  activeAdAccountName: null,
  platform: null,
  setActiveAdAccount: (id, name, platform) =>
    set({
      activeAdAccountId: id,
      activeAdAccountName: name,
      platform,
    }),
  clearActiveAdAccount: () =>
    set({
      activeAdAccountId: null,
      activeAdAccountName: null,
      platform: null,
    }),
}))
