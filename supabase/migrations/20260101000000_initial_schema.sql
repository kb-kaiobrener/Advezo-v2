-- ============================================================
-- Migration: 20260101000000_initial_schema
-- Creates: workspaces, workspace_members, workspace_settings
-- Includes: RLS policies + auto-create trigger for settings
-- ============================================================

-- ── WORKSPACES ────────────────────────────────────────────────
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth_workspace_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::uuid;
$$;

CREATE POLICY workspace_self ON workspaces
  USING (id = auth_workspace_id());

-- ── WORKSPACE_MEMBERS ────────────────────────────────────────
CREATE TABLE workspace_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  joined_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON workspace_members
  USING (workspace_id = auth_workspace_id());

-- ── WORKSPACE_SETTINGS ────────────────────────────────────────
CREATE TABLE workspace_settings (
  workspace_id                        uuid PRIMARY KEY
                                        REFERENCES workspaces(id) ON DELETE CASCADE,
  classification_confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.700
                                        CHECK (classification_confidence_threshold BETWEEN 0.500 AND 1.000),
  meta_pixel_id                       text,
  google_ads_conversion_action_id     text,
  updated_at                          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON workspace_settings
  USING (workspace_id = auth_workspace_id());

-- ── TRIGGER: auto-cria workspace_settings no INSERT de workspaces ─
CREATE OR REPLACE FUNCTION create_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_workspace_settings();
