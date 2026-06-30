'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@advezo/database'
import { LeadStatus } from '@advezo/types'
import {
  sendCompleteRegistrationCapi,
  sendPurchaseCapi,
  type StatusCapiLead,
} from '@/lib/capi/lead'

/**
 * Server Actions de gestão de status de lead (Story 8.4 — AC 8.4.3 / 8.4.4 / 8.4.5 / 8.4.7).
 *
 * Protegidas por `supabase.auth.getUser()`: sem usuário autenticado → retorno
 * `{ error: 'Unauthorized' }` (padrão Next.js Server Actions — não há 401 HTTP direto;
 * o caller na UI trata o erro). Usa `createSupabaseServerClient()` (sessão do usuário),
 * NÃO o service-role — a RLS de `leads` por workspace é respeitada na leitura e escrita.
 *
 * Máquina de estados (Seção 6 da SPEC):
 *   novo          → qualificado | desqualificado
 *   qualificado   → desqualificado | convertido
 *   desqualificado→ novo            (re-aquisição — FR-QC6)
 *   convertido    → ∅               (terminal — bloqueado)
 *
 * `convertido` é terminal: qualquer tentativa de alterar um lead já convertido retorna
 * `{ error: 'status_convertido_terminal' }`.
 *
 * Efeitos por destino:
 *   → qualificado : qualified_at = now(); dispara CAPI CompleteRegistration (FR-QC4, MUST).
 *   → convertido  : converted_at = now(); dispara CAPI Purchase (FR-QC5, SHOULD).
 *   → desqualificado: libera o slot do índice parcial leads_active_dedup (FR-QC6) —
 *                     consequência natural do predicado WHERE status NOT IN ('desqualificado'),
 *                     sem lógica adicional.
 *
 * Segurança: email_encrypted nunca é logado nem descriptografado aqui (a descriptografia
 * em memória para o hash CAPI pertence à Story 8.7). CAPI é fire-and-forget (`.catch`),
 * nunca bloqueia o retorno da ação.
 */

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  novo: ['qualificado', 'desqualificado'],
  qualificado: ['desqualificado', 'convertido'],
  desqualificado: ['novo'],
  convertido: [], // terminal
}

/** Colunas mínimas necessárias para validar a transição e montar o payload CAPI. */
interface LeadStatusRow extends StatusCapiLead {
  status: LeadStatus
}

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus
): Promise<{ error?: string }> {
  if (!leadId) return { error: 'Lead inválido' }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Busca o lead atual para validar a transição. A RLS por workspace garante que um lead
  // de outro workspace não seja encontrado (single() → erro → tratado como não encontrado).
  const { data: lead } = await supabase
    .from('leads')
    .select('status, phone_hash, email_encrypted, consent_given_at, client_id')
    .eq('id', leadId)
    .single<LeadStatusRow>()

  if (!lead) return { error: 'Lead não encontrado' }

  // Terminal: convertido nunca transiciona (checado antes da tabela de transições para
  // devolver o código de erro específico exigido pelo AC 8.4.3).
  if (lead.status === 'convertido') {
    return { error: 'status_convertido_terminal' }
  }

  const allowed = VALID_TRANSITIONS[lead.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { error: `Transição ${lead.status}→${newStatus} não permitida` }
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'qualificado') {
    updateData.qualified_at = new Date().toISOString()
  }
  if (newStatus === 'convertido') {
    updateData.converted_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId)
  if (error) return { error: error.message }

  // AC 8.4.5: disparo CAPI assíncrono conforme o destino (fire-and-forget).
  const capiLead: StatusCapiLead = {
    phone_hash: lead.phone_hash,
    email_encrypted: lead.email_encrypted,
    consent_given_at: lead.consent_given_at,
    client_id: lead.client_id,
  }
  if (newStatus === 'qualificado') {
    sendCompleteRegistrationCapi(capiLead, leadId).catch((err) =>
      console.error('[CAPI CompleteRegistration] dispatch failed:', err)
    )
  }
  if (newStatus === 'convertido') {
    sendPurchaseCapi(capiLead, leadId).catch((err) =>
      console.error('[CAPI Purchase] dispatch failed:', err)
    )
  }

  // AC 8.4.7: revalida caches Next.js das páginas que exibem leads.
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return {}
}

/**
 * Atualização em lote de status (AC 8.4.4). Processa cada lead via `updateLeadStatus`
 * com `Promise.allSettled` — uma falha individual (transição inválida, lead terminal,
 * não encontrado) NÃO cancela os demais. Retorna a contagem de sucessos e a lista de
 * mensagens de erro dos que falharam.
 *
 * Cada `updateLeadStatus` já chama `revalidatePath` ao concluir com sucesso, então o
 * cache é revalidado por efeito das atualizações bem-sucedidas.
 */
export async function bulkUpdateLeadStatus(
  leadIds: string[],
  status: LeadStatus
): Promise<{ updated: number; errors: string[] }> {
  if (!leadIds || leadIds.length === 0) return { updated: 0, errors: [] }

  const results = await Promise.allSettled(
    leadIds.map((id) => updateLeadStatus(id, status))
  )

  let updated = 0
  const errors: string[] = []

  results.forEach((result, index) => {
    const leadId = leadIds[index]
    if (result.status === 'fulfilled') {
      if (result.value.error) {
        errors.push(`${leadId}: ${result.value.error}`)
      } else {
        updated += 1
      }
    } else {
      // Rejeição inesperada (ex.: falha de rede no Supabase) — não derruba o lote.
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      errors.push(`${leadId}: ${reason}`)
    }
  })

  return { updated, errors }
}
