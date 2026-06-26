-- ============================================================
-- Migration: 20260101000003_clients
-- Purpose: Cria tabela clients (Story 1.4 — Gestão de Clientes CRUD)
-- DDL source: docs/architecture.md Seção 9
-- Depende de: 000002 (auth_workspace_id() JWT-based ativo)
-- ============================================================

-- ── HELPER: updated_at automático ────────────────────────────────────
-- Função genérica reutilizável por todas as tabelas com updated_at.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── CLIENTS ──────────────────────────────────────────────────────────

CREATE TABLE clients (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  document      text,
  contact_email text,
  contact_phone text,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON clients
  FOR ALL USING (workspace_id = auth_workspace_id());

CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
