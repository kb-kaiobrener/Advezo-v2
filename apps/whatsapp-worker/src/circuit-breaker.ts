// src/circuit-breaker.ts
// Circuit breaker de reconexão WhatsApp (AC 3.1.7).
//
// Regra: após `threshold` (default 5) falhas de reconexão dentro de uma janela
// deslizante de `windowMs` (default 10 min), o worker:
//   - grava whatsapp_accounts.cb_paused_at = now(), status = 'cb_paused';
//   - PARA de tentar reconectar (caller não reagenda).
// A UI (Story 3.2) consome cb_paused_at para exibir alerta.
//
// cb_failure_count é gravado a cada falha (tamanho da janela podada) e zerado
// após conexão bem-sucedida (junto com cb_paused_at = NULL).
//
// Design: a janela de falhas vive em memória (worker é processo único de longa
// duração por conta). O banco é o espelho para a UI, não a fonte de verdade da
// contagem. cb_paused_at persistido sobrevive a restart e mantém o bloqueio.

import { createSupabaseServiceClient } from '@advezo/database/service'

export const DEFAULT_THRESHOLD = 5
export const DEFAULT_WINDOW_MS = 10 * 60 * 1000 // 10 minutos

export interface FailureResult {
  /** true → circuit aberto: caller NÃO deve reconectar. */
  paused: boolean
  /** Nº de falhas dentro da janela após registrar esta. */
  failureCount: number
}

/** Lê threshold/janela do ambiente, com defaults seguros. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): {
  threshold: number
  windowMs: number
} {
  const threshold = Number(env.CB_FAILURE_THRESHOLD)
  const windowMinutes = Number(env.CB_WINDOW_MINUTES)
  return {
    threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_THRESHOLD,
    windowMs:
      Number.isFinite(windowMinutes) && windowMinutes > 0
        ? windowMinutes * 60 * 1000
        : DEFAULT_WINDOW_MS,
  }
}

/**
 * Função de atualização do banco, injetável para testes (DI). Em produção usa
 * createSupabaseServiceClient(). Recebe os campos a atualizar na linha da conta.
 */
export type UpdateAccountFn = (
  workspaceId: string,
  accountId: string,
  patch: Record<string, unknown>,
) => Promise<void>

function defaultUpdateAccount(): UpdateAccountFn {
  return async (workspaceId, accountId, patch) => {
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase
      .from('whatsapp_accounts')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId)
    if (error) {
      throw new Error(`Falha ao atualizar whatsapp_accounts (${accountId}): ${error.message}`)
    }
  }
}

export class CircuitBreaker {
  private failures: number[] = []
  private readonly threshold: number
  private readonly windowMs: number
  private readonly updateAccount: UpdateAccountFn
  private readonly now: () => number

  constructor(opts?: {
    threshold?: number
    windowMs?: number
    updateAccount?: UpdateAccountFn
    now?: () => number
  }) {
    const cfg = readConfig()
    this.threshold = opts?.threshold ?? cfg.threshold
    this.windowMs = opts?.windowMs ?? cfg.windowMs
    this.updateAccount = opts?.updateAccount ?? defaultUpdateAccount()
    this.now = opts?.now ?? Date.now
  }

  /** true se o circuit está aberto (já atingiu o threshold e não foi resetado). */
  get isPaused(): boolean {
    return this.prune().length >= this.threshold
  }

  /** Remove falhas fora da janela e retorna as que restam. */
  private prune(): number[] {
    const cutoff = this.now() - this.windowMs
    this.failures = this.failures.filter((t) => t > cutoff)
    return this.failures
  }

  /**
   * Registra uma falha de reconexão. Se o nº de falhas na janela atingir o
   * threshold, persiste cb_paused_at = now() e retorna paused=true (caller para
   * de reconectar). Caso contrário, atualiza cb_failure_count e retorna paused=false.
   */
  async recordFailure(workspaceId: string, accountId: string): Promise<FailureResult> {
    const recent = this.prune()
    recent.push(this.now())
    this.failures = recent
    const failureCount = recent.length

    if (failureCount >= this.threshold) {
      await this.updateAccount(workspaceId, accountId, {
        status: 'cb_paused',
        cb_paused_at: new Date(this.now()).toISOString(),
        cb_failure_count: failureCount,
      })
      return { paused: true, failureCount }
    }

    await this.updateAccount(workspaceId, accountId, { cb_failure_count: failureCount })
    return { paused: false, failureCount }
  }

  /**
   * Registra conexão bem-sucedida: zera a janela em memória e reseta o estado
   * persistido (status='connected', connected_at=now, cb_failure_count=0,
   * cb_paused_at=NULL). Circuit fechado.
   */
  async recordSuccess(workspaceId: string, accountId: string): Promise<void> {
    this.failures = []
    await this.updateAccount(workspaceId, accountId, {
      status: 'connected',
      connected_at: new Date(this.now()).toISOString(),
      cb_failure_count: 0,
      cb_paused_at: null,
    })
  }
}
