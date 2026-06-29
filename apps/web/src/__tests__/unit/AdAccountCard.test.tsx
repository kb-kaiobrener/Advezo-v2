import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { AdAccountDisplay } from '@advezo/types'
import { AdAccountCard } from '@/components/molecules/AdAccountCard'

/**
 * Testes de componente — AdAccountCard (Story 2.1 — AC 2.1.7 / 2.1.8)
 *
 * vitest neste projeto não tem cleanup automático de RTL (globals: false),
 * então limpamos manualmente entre testes para evitar nós duplicados.
 */
afterEach(() => cleanup())

function makeAccount(overrides: Partial<AdAccountDisplay> = {}): AdAccountDisplay {
  return {
    id: 'aa-1',
    workspace_id: 'ws-1',
    client_id: null,
    platform: 'meta',
    external_account_id: 'act_123',
    account_name: 'Minha Conta Meta',
    token_type: 'access_token',
    status: 'active',
    error_message: null,
    last_synced_at: null,
    created_at: '2026-06-26T00:00:00.000Z',
    updated_at: '2026-06-26T00:00:00.000Z',
    ...overrides,
  }
}

describe('AdAccountCard', () => {
  it('renderiza conta active com nome, plataforma e badge de status', () => {
    const { getByText } = render(<AdAccountCard account={makeAccount()} />)
    expect(getByText('Minha Conta Meta')).toBeTruthy()
    expect(getByText('Meta')).toBeTruthy()
    expect(getByText('Ativa')).toBeTruthy()
  })

  it('renderiza conta expired com aviso "Token expirado" e link de reconexão', () => {
    const { getByText, getByRole } = render(
      <AdAccountCard account={makeAccount({ status: 'expired' })} />
    )
    expect(getByText('Expirada')).toBeTruthy()
    expect(getByText('Token expirado')).toBeTruthy()

    const reconnect = getByRole('link', { name: 'Reconectar' })
    expect(reconnect.getAttribute('href')).toBe('/api/oauth/meta/start')
  })

  it('renderiza conta Google expired com link de reconexão apontando para a rota Google (Story 2.2 — AC 2.2.7)', () => {
    const { getByText, getByRole } = render(
      <AdAccountCard
        account={makeAccount({ platform: 'google', external_account_id: '1234567890', status: 'expired' })}
      />
    )
    expect(getByText('Google')).toBeTruthy()

    const reconnect = getByRole('link', { name: 'Reconectar' })
    expect(reconnect.getAttribute('href')).toBe('/api/oauth/google/start')
  })

  it('renderiza conta error com a error_message inline', () => {
    const { getByText } = render(
      <AdAccountCard
        account={makeAccount({ status: 'error', error_message: 'Permissão revogada pela Meta' })}
      />
    )
    expect(getByText('Erro')).toBeTruthy()
    expect(getByText('Permissão revogada pela Meta')).toBeTruthy()
  })
})
