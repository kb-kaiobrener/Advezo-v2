'use client'

import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'

interface Props {
  workspace: { id: string; name: string; role: string }
  children: React.ReactNode
}

export default function WorkspaceProvider({ workspace, children }: Props) {
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)

  useEffect(() => {
    setWorkspace(workspace)
  }, [workspace, setWorkspace])

  return <>{children}</>
}
