export interface Workspace {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'viewer'
  joined_at: string | null
  created_at: string
}

export interface WorkspaceSettings {
  workspace_id: string
  classification_confidence_threshold: number
  meta_pixel_id: string | null
  google_ads_conversion_action_id: string | null
  updated_at: string
}

export interface Client {
  id: string
  workspace_id: string
  name: string
  document: string | null
  contact_email: string | null
  contact_phone: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type AdPlatform = 'meta' | 'google'
export type AdAccountStatus = 'active' | 'expired' | 'error'

export interface AdAccount {
  id: string
  workspace_id: string
  client_id: string | null
  platform: AdPlatform
  external_account_id: string
  account_name: string | null
  encrypted_token: string
  encrypted_refresh_token: string | null
  token_type: string
  status: AdAccountStatus
  error_message: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Shape seguro de AdAccount para uso em UI/listagens: omite as colunas de token
 * criptografado. Queries de UI NUNCA devem selecionar encrypted_token /
 * encrypted_refresh_token (AC 2.1.2 / AC 2.1.5).
 */
export type AdAccountDisplay = Omit<
  AdAccount,
  'encrypted_token' | 'encrypted_refresh_token'
>

export type AdCampaignStatus = 'active' | 'paused' | 'deleted' | 'archived'

/**
 * Campanha de anúncio sincronizada de uma conta (Story 2.3).
 * Uma linha por campanha por conta — UNIQUE (ad_account_id, external_campaign_id).
 */
export interface AdCampaign {
  id: string
  workspace_id: string
  ad_account_id: string
  platform: AdPlatform
  external_campaign_id: string
  name: string | null
  status: AdCampaignStatus | null
  objective: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  start_time: string | null
  stop_time: string | null
  created_at: string
  updated_at: string
}

/**
 * Métricas diárias de uma campanha (Story 2.3).
 * Deduplicação por UNIQUE (campaign_id, date) — janela de atribuição fixa 7d_click.
 */
export interface CampaignMetrics {
  id: string
  campaign_id: string
  workspace_id: string
  date: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  revenue: number
  synced_at: string
}

/**
 * Registro de erro de sync por workspace (Story 2.3 — NFR-4: falha nunca silenciosa).
 * `resolved_at` nullable: erro permanece aberto até resolução manual/reconexão.
 */
export interface SyncError {
  id: string
  workspace_id: string
  ad_account_id: string | null
  platform: AdPlatform | null
  error_type: string
  error_message: string
  occurred_at: string
  resolved_at: string | null
}

/** Tipos de alerta suportados (Story 2.9 — AC 2.9.7). Extensível no Epic 3. */
export type AlertType = 'low_balance'

/**
 * Alerta proativo por conta de anúncio (Story 2.9 — Alertas de Saldo Proativo).
 * Deduplicação: índice único parcial (ad_account_id, alert_type) WHERE resolved_at
 * IS NULL — no máximo 1 alerta ATIVO por (conta, tipo). `resolved_at` nullable: o
 * alerta permanece ativo até resolução automática (projeção recupera) ou manual.
 */
export interface Alert {
  id: string
  workspace_id: string
  ad_account_id: string
  alert_type: AlertType
  threshold_days: number
  projected_days: number
  created_at: string
  resolved_at: string | null
}

