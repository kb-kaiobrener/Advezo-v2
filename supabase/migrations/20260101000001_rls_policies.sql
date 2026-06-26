-- ============================================================
-- Migration: 20260101000001_rls_policies
-- Replaces single-workspace policies from initial_schema with
-- subquery-based policies that support multi-workspace membership.
-- ============================================================

-- ── DROP OLD POLICIES ────────────────────────────────────────────

DROP POLICY IF EXISTS workspace_self       ON workspaces;
DROP POLICY IF EXISTS workspace_isolation  ON workspace_members;
DROP POLICY IF EXISTS workspace_isolation  ON workspace_settings;

-- ── WORKSPACES ───────────────────────────────────────────────────
-- User can only see/modify workspaces they are a member of.

CREATE POLICY workspace_member_access ON workspaces
  FOR ALL USING (
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- ── WORKSPACE_MEMBERS ────────────────────────────────────────────
-- User can only see their own membership rows.

CREATE POLICY own_workspace_members ON workspace_members
  FOR ALL USING (user_id = auth.uid());

-- ── WORKSPACE_SETTINGS ───────────────────────────────────────────
-- Settings inherit access via workspace membership.

CREATE POLICY workspace_settings_access ON workspace_settings
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
