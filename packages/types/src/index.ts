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

export interface AdAccount {
  id: string
  workspace_id: string
  client_id: string | null
  platform: 'meta' | 'google'
  external_account_id: string
  name: string
  status: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}
