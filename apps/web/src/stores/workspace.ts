'use client'

import { create } from 'zustand'

interface WorkspaceState {
  workspaceId: string | null
  workspaceName: string | null
  role: 'owner' | 'admin' | 'viewer' | null
  setWorkspace: (workspace: { id: string; name: string; role: string }) => void
  clearWorkspace: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaceId: null,
  workspaceName: null,
  role: null,
  setWorkspace: ({ id, name, role }) =>
    set({
      workspaceId: id,
      workspaceName: name,
      role: role as WorkspaceState['role'],
    }),
  clearWorkspace: () =>
    set({ workspaceId: null, workspaceName: null, role: null }),
}))
