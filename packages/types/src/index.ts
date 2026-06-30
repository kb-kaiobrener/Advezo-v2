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

// ──────────────────────────────────────────────────────────────
// Epic 8 — Qualificação de Leads (Story 8.1)
// ──────────────────────────────────────────────────────────────

/** Origem do lead (Story 8.1). `landing_page` = formulário embed; `lead_ads` = Meta Lead Ads. */
export type LeadSource = 'landing_page' | 'lead_ads'

/**
 * Ciclo de vida do lead (Story 8.1). Valores em PT-BR conforme CHECK constraint da tabela
 * `leads`. `desqualificado` libera o slot de dedup (índice parcial leads_active_dedup).
 */
export type LeadStatus = 'novo' | 'qualificado' | 'desqualificado' | 'convertido'

/** Operadores suportados em qualification_rules v1 (Story 8.1 / SPEC Epic 8). */
export type QualificationOperator =
  | 'eq'
  | 'not_eq'
  | 'contains'
  | 'filled'
  | 'not_filled'

/**
 * Regra de qualificação avaliada sobre os campos do lead (Story 8.1).
 * `value` é null para operadores que não comparam valor (`filled` / `not_filled`).
 */
export interface QualificationRule {
  field: string
  operator: QualificationOperator
  value: string | null
}

/**
 * Definição de um campo do formulário (lead_forms.fields jsonb) — Story 8.1.
 * Regra: se há um campo `type:'email'`, deve existir exatamente um
 * `type:'consent_checkbox'` com `linked_field:'email'`.
 */
export interface LeadFormField {
  id: string
  type: 'text' | 'phone' | 'email' | 'consent_checkbox' | 'select'
  label: string
  required: boolean
  fixed: boolean
  options?: string[]
  linked_field?: string
}

/**
 * Lead capturado via landing page ou Meta Lead Ads (Story 8.1).
 * Segurança: `email_encrypted` é AES-256-GCM (nunca texto plano); `phone_hash` é
 * HMAC-SHA256 com workspace_salt. Dedup ativo por (client_id, phone_hash) e por
 * meta_lead_id (índices únicos parciais).
 */
export interface Lead {
  id: string
  workspace_id: string
  client_id: string | null
  lead_form_id: string | null
  meta_lead_id: string | null
  source: LeadSource
  status: LeadStatus
  name: string
  phone_hash: string
  email_encrypted: string | null
  consent_given_at: string | null
  field_data: Record<string, unknown>
  qualified_at: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Formulário de captura de leads (landing page embed) — Story 8.1.
 * `embed_token` é único globalmente; `slug` é único por workspace.
 */
export interface LeadForm {
  id: string
  workspace_id: string
  client_id: string | null
  ad_account_id: string | null
  name: string
  slug: string
  embed_token: string
  fields: LeadFormField[]
  qualification_rules: QualificationRule[]
  allowed_origins: string[] | null
  is_active: boolean
  created_at: string
}

/**
 * Payload de criação de um lead_form (Story 8.2 — POST /api/lead-forms).
 * `workspace_id`, `slug` e `embed_token` NÃO entram aqui: são derivados no servidor
 * (workspace do JWT; slug do nome; embed_token via crypto.randomBytes). `client_id`
 * é obrigatório na criação (AC 8.2.2).
 */
export interface CreateLeadFormInput {
  name: string
  client_id: string
  ad_account_id?: string | null
  fields?: LeadFormField[]
  qualification_rules?: QualificationRule[]
  allowed_origins?: string[] | null
}

/**
 * Payload de atualização de um lead_form (Story 8.2 — PUT /api/lead-forms/:id).
 * Todos os campos opcionais (atualização parcial). `embed_token` e `slug` são imutáveis
 * via API; `is_active` é controlado pelo soft-delete (DELETE), não pelo PUT.
 */
export interface UpdateLeadFormInput {
  name?: string
  client_id?: string | null
  ad_account_id?: string | null
  fields?: LeadFormField[]
  qualification_rules?: QualificationRule[]
  allowed_origins?: string[] | null
}

/**
 * Resposta de GET /api/lead-forms/:id/embed (Story 8.2 — AC 8.2.4).
 * `snippet` é o `<script>` pronto para colar na landing page; `embed_token` é o token
 * único do formulário; `instructions` é texto curto de uso.
 */
export interface LeadFormEmbedResponse {
  snippet: string
  embed_token: string
  instructions: string
}

/**
 * Vínculo entre uma conta de anúncio e um formulário Meta Lead Ads (Story 8.1).
 * Único por (ad_account_id, leadgen_form_id).
 */
export interface LeadAdsConfig {
  id: string
  workspace_id: string
  ad_account_id: string
  client_id: string | null
  leadgen_form_id: string
  created_at: string
}

/**
 * Fila de processamento de leads recebidos via webhook Meta Lead Ads (Story 8.1).
 * Dedup de entrega duplicada por meta_lead_id (índice único). Worker consome
 * status IN ('pending','failed') AND retry_count < 3.
 */
export interface LeadProcessingQueue {
  id: string
  workspace_id: string
  meta_lead_id: string
  ad_account_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  retry_count: number
  last_error: string | null
  enqueued_at: string
  completed_at: string | null
}

// ── META CONVERSIONS API (CAPI) — Story 8.7 ──────────────────────

/** Nome dos eventos enviados à Meta Conversions API (FR-CAPI2). */
export type CAPIEventName = 'Lead' | 'CompleteRegistration' | 'Purchase'

/**
 * Bloco `user_data` do payload CAPI (Story 8.7 — AC 8.7.1, AC 8.7.2).
 *
 * Todos os identificadores pessoais são hasheados antes de sair desta máquina:
 *  - `ph`: telefone — já é HMAC-SHA256 (coluna `leads.phone_hash`), usado diretamente.
 *  - `em`: SHA256(lowercase(trim(email))) — calculado EM MEMÓRIA a partir de
 *    `email_encrypted` descriptografado; NUNCA persistido. Presente apenas quando o
 *    gate de consentimento por fonte autoriza (AC 8.7.2).
 *  - `lead_id`: `meta_lead_id` cru (não-hasheado) — sinal de deduplicação Meta para
 *    leads vindos de Lead Ads (FR-CAPI4). Não é PII.
 *
 * Arrays porque a Meta CAPI aceita múltiplos valores hasheados por campo.
 */
export interface CAPIUserData {
  ph: string[]
  em?: string[]
  lead_id?: string
}

/**
 * Payload de um evento individual enviado à Meta Conversions API (AC 8.7.1, AC 8.7.6).
 * `event_id = lead.id` (UUID) serve como chave de deduplicação Meta de 7 dias.
 */
export interface CAPILeadPayload {
  event_name: CAPIEventName
  event_time: number
  event_id: string
  action_source: 'website'
  user_data: CAPIUserData
}

/**
 * Status de um registro em `conversion_events` (Story 8.7 — AC 8.7.3, AC 8.7.4).
 *  - `skipped`: gate de envio não satisfeito — decisão explícita auditável, não erro.
 *  - `pending`: gravado ANTES da chamada Meta.
 *  - `sent`: Meta retornou `events_received >= 1`.
 *  - `failed`: erro HTTP/parsing; `error_message` preenchido.
 */
export type ConversionEventStatus = 'skipped' | 'pending' | 'sent' | 'failed'

