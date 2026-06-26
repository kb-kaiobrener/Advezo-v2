/**
 * Teste de integração: auth_workspace_id() + custom_access_token_hook
 *
 * OBJETIVO: verificar que o hook do Supabase Auth está ativo e injetando
 * workspace_id no JWT corretamente. Este teste DEVE falhar com mensagem
 * clara se o hook não estiver configurado no ambiente.
 *
 * PRÉ-REQUISITOS para rodar:
 *   - NEXT_PUBLIC_SUPABASE_URL definido
 *   - SUPABASE_SERVICE_ROLE_KEY definido
 *   - Hook ativo: Supabase Dashboard → Authentication → Hooks →
 *     Custom Access Token → public.custom_access_token_hook
 *
 * COMO RODAR:
 *   pnpm --filter web vitest run src/__tests__/integration/auth-workspace-id.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasCredentials   = Boolean(supabaseUrl && serviceRoleKey)

const HOOK_NOT_ACTIVE_MSG = `
[HOOK NÃO ATIVO] auth_workspace_id() retornou NULL ou não há workspace visível.

O custom_access_token_hook não está configurado neste ambiente.

Passo obrigatório:
  Supabase Dashboard → Authentication → Hooks →
  Custom Access Token → selecionar: public.custom_access_token_hook

Referência: docs/architecture.md Seção 9 — "Auth Hook (Passo Manual)"
`

describe.runIf(hasCredentials)('Integration: auth_workspace_id hook', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adminClient: any
  const testEmail    = `hook-test-${Date.now()}@advezo-test.invalid`
  const testPassword = `Test${Date.now()}!`
  let testUserId: string
  let testWorkspaceId: string

  beforeAll(async () => {
    adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Cria usuário de teste via Admin API
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })
    if (createError) throw new Error(`Falha ao criar usuário de teste: ${createError.message}`)
    testUserId = authData.user.id

    // Cria workspace de teste
    const { data: workspace, error: workspaceError } = await adminClient
      .from('workspaces')
      .insert({ name: 'Test Workspace — hook integration', created_by: testUserId })
      .select('id')
      .single()
    if (workspaceError) throw new Error(`Falha ao criar workspace: ${workspaceError.message}`)
    testWorkspaceId = workspace.id

    // Adiciona usuário como owner
    const { error: memberError } = await adminClient
      .from('workspace_members')
      .insert({ workspace_id: testWorkspaceId, user_id: testUserId, role: 'owner' })
    if (memberError) throw new Error(`Falha ao criar membership: ${memberError.message}`)
  })

  afterAll(async () => {
    // Limpeza — deleta usuário (cascade apaga workspace_members)
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId)
    }
    // Workspace deve ser deletado manualmente (created_by restringe ON DELETE RESTRICT)
    if (testWorkspaceId) {
      await adminClient.from('workspaces').delete().eq('id', testWorkspaceId)
    }
  })

  it('auth_workspace_id() retorna UUID não-nulo para usuário autenticado com workspace válido', async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const userClient = createClient(supabaseUrl!, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })
    if (signInError) throw new Error(`Falha no sign-in: ${signInError.message}`)

    // Consulta workspaces — RLS usa id = auth_workspace_id()
    // Se o hook não estiver ativo: auth_workspace_id() = NULL → nenhum workspace visível
    const { data, error } = await userClient
      .from('workspaces')
      .select('id')

    if (error) throw new Error(`Erro na query: ${error.message}`)

    if (!data || data.length === 0) {
      throw new Error(HOOK_NOT_ACTIVE_MSG)
    }

    expect(data[0].id).toBe(testWorkspaceId)
  })

  it('RLS isola clientes por workspace — usuário não vê clientes de outros workspaces', async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    let workspaceBId: string | null = null

    try {
      // Insere um cliente no workspace A para confirmar que dados próprios ficam visíveis
      const { error: clientAError } = await adminClient
        .from('clients')
        .insert({ workspace_id: testWorkspaceId, name: 'Cliente Workspace A — isolation test' })
      if (clientAError) throw new Error(`Falha ao inserir cliente no workspace A: ${clientAError.message}`)

      // Cria workspace B e insere um cliente nele (via admin, bypassa RLS)
      const { data: workspaceB, error: wsBError } = await adminClient
        .from('workspaces')
        .insert({ name: 'Test Workspace B — isolation test', created_by: testUserId })
        .select('id')
        .single()
      if (wsBError) throw new Error(`Falha ao criar workspace B: ${wsBError.message}`)
      workspaceBId = workspaceB.id

      const { error: clientBError } = await adminClient
        .from('clients')
        .insert({ workspace_id: workspaceBId, name: 'Cliente Workspace B — deve ser invisível' })
      if (clientBError) throw new Error(`Falha ao inserir cliente no workspace B: ${clientBError.message}`)

      // Autentica como usuário do workspace A
      const userClient = createClient(supabaseUrl!, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error: signInError } = await userClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      })
      if (signInError) throw new Error(`Falha no sign-in: ${signInError.message}`)

      const { data, error } = await userClient
        .from('clients')
        .select('id, workspace_id, name')

      if (error) throw new Error(`Erro na query de clients: ${error.message}`)

      // Se o hook não está ativo: auth_workspace_id() = NULL → nenhum cliente visível
      // (o teste 1 já deve ter capturado isso — mas garantimos falha ruidosa aqui também)
      if (!data || data.length === 0) {
        throw new Error(HOOK_NOT_ACTIVE_MSG + '\n\n[Esperava ver o cliente do workspace A mas recebeu 0 rows]')
      }

      // Deve ver o cliente do próprio workspace A
      const hasClientFromA = data.some(
        (c: { name: string }) => c.name === 'Cliente Workspace A — isolation test',
      )
      expect(hasClientFromA).toBe(true)

      // NÃO deve ver o cliente do workspace B
      const hasClientFromB = data.some(
        (c: { workspace_id: string }) => c.workspace_id === workspaceBId,
      )
      expect(hasClientFromB).toBe(false)
    } finally {
      if (workspaceBId) {
        await adminClient.from('clients').delete().eq('workspace_id', workspaceBId)
        await adminClient.from('workspaces').delete().eq('id', workspaceBId)
      }
      await adminClient.from('clients').delete().eq('workspace_id', testWorkspaceId)
    }
  })

  it('workspace_members filtra pelo workspace do JWT (não todos os membros do sistema)', async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const userClient = createClient(supabaseUrl!, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword })

    const { data, error } = await userClient
      .from('workspace_members')
      .select('workspace_id, user_id, role')

    if (error) throw new Error(`Erro na query: ${error.message}`)

    if (!data || data.length === 0) {
      throw new Error(HOOK_NOT_ACTIVE_MSG)
    }

    // Todos os membros visíveis devem ser do workspace do JWT
    const allFromSameWorkspace = data.every((m: { workspace_id: string }) => m.workspace_id === testWorkspaceId)
    expect(allFromSameWorkspace).toBe(true)
  })
})

describe.skipIf(hasCredentials)('Integration: auth_workspace_id hook (env não configurado)', () => {
  it.skip('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY necessários para rodar este teste', () => {})
})
