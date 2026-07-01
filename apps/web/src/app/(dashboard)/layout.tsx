import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import WorkspaceProvider from '@/components/providers/WorkspaceProvider'
import QueryProvider from '@/components/providers/QueryProvider'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Service client bypassa RLS — garante leitura mesmo sem workspace_id no JWT
  const serviceClient = createSupabaseServiceClient()
  const { data: membership } = await serviceClient
    .from('workspace_members')
    .select('workspace_id, role, workspaces(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboarding')

  type WorkspaceRow = { name: string }
  const workspacesData = membership.workspaces as WorkspaceRow | WorkspaceRow[] | null
  const workspaceName = Array.isArray(workspacesData)
    ? workspacesData[0]?.name ?? 'Workspace'
    : workspacesData?.name ?? 'Workspace'

  const workspace = {
    id: membership.workspace_id,
    name: workspaceName,
    role: membership.role,
  }

  return (
    <QueryProvider>
      <WorkspaceProvider workspace={workspace}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </WorkspaceProvider>
    </QueryProvider>
  )
}
