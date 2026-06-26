'use client'

import { create } from 'zustand'

interface LayoutState {
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  toggleSidebar: () => void
}

export const useLayoutStore = create<LayoutState>()((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (value) => set({ sidebarOpen: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
