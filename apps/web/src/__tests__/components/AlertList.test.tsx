import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AlertList, type AlertListItem } from '@/components/molecules/AlertList'
import { AdAccountCard } from '@/components/molecules/AdAccountCard'
import type { AdAccountDisplay } from '@advezo/types'

// A Server Action é mockada — o teste cobre apenas a renderização, não a chamada real.
vi.mock('@/app/actions/alerts', () => ({
  resolveAlert: vi.fn(async () => ({})),
}))

// apps/web vitest não tem auto-cleanup do RTL — limpa o DOM entre renders.
afterEach(cleanup)

function alert(overrides: Partial<AlertListItem> = {}): AlertListItem {
  return {
    id: 'alert-1',
    alert_type: 'low_balance',
    projected_days: 3,
    created_at: '2026-06-28T10:00:00.000Z',
    ...overrides,
  }
}

function account(overrides: Partial<AdAccountDisplay> = {}): AdAccountDisplay {
  return {
    id: 'acc-1',
    workspace_id: 'ws-1',
    client_id: null,
    platform: 'meta',
    external_account_id: 'act_123',
    account_name: 'Conta Principal',
    token_type: 'access_token',
    status: 'active',
    error_message: null,
    last_synced_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AlertList (Story 2.9 — AC 2.9.5)', () => {
  it('renderiza alerta ativo com tipo, projeção e botão de resolver', () => {
    render(<AlertList alerts={[alert()]} />)

    expect(screen.getByText('Saldo baixo')).toBeDefined()
    expect(screen.getByText(/3 dia\(s\) de saldo/)).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Marcar como resolvido' })
    ).toBeDefined()
  })

  it('não renderiza nada quando não há alertas ativos', () => {
    const { container } = render(<AlertList alerts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza um botão de resolver por alerta', () => {
    render(
      <AlertList
        alerts={[alert({ id: 'a1' }), alert({ id: 'a2', projected_days: 1 })]}
      />
    )
    expect(
      screen.getAllByRole('button', { name: 'Marcar como resolvido' })
    ).toHaveLength(2)
  })
})

describe('AdAccountCard — badge de alerta (Story 2.9 — AC 2.9.4)', () => {
  it('exibe o badge "Saldo baixo" quando hasActiveAlert é true', () => {
    render(<AdAccountCard account={account()} hasActiveAlert />)
    expect(screen.getByLabelText('Alerta de saldo')).toBeDefined()
    expect(screen.getByText('Saldo baixo')).toBeDefined()
  })

  it('NÃO exibe o badge quando hasActiveAlert é false (alerta resolvido)', () => {
    render(<AdAccountCard account={account()} hasActiveAlert={false} />)
    expect(screen.queryByLabelText('Alerta de saldo')).toBeNull()
  })

  it('badge ausente por padrão (sem a prop)', () => {
    render(<AdAccountCard account={account()} />)
    expect(screen.queryByLabelText('Alerta de saldo')).toBeNull()
  })
})
