-- gotomemory initial schema (system spec §8). Production target: PostgreSQL + pgvector.
-- The in-memory repository backs dev/test; this is the durable backend.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_collections (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scope IN ('personal', 'project', 'team', 'session'))
);

CREATE TABLE memories (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  collection_id UUID REFERENCES memory_collections(id),
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  content_encrypted BYTEA NOT NULL,
  summary_encrypted BYTEA NOT NULL,
  summary_preview TEXT,
  summary_sensitivity TEXT NOT NULL DEFAULT 'normal',
  subject TEXT,
  predicate TEXT,
  value TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  embedding_policy TEXT NOT NULL DEFAULT 'allowed',
  freshness TEXT NOT NULL DEFAULT 'timeless',
  status TEXT NOT NULL DEFAULT 'active',
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  superseded_by UUID REFERENCES memories(id),
  ttl TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  encryption_key_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (sensitivity IN ('public', 'normal', 'private', 'secret')),
  CHECK (summary_sensitivity IN ('public', 'normal', 'private', 'secret')),
  CHECK (embedding_policy IN ('allowed', 'redacted_only', 'disabled')),
  CHECK (source IN ('user_explicit', 'manual', 'chatgpt', 'claude', 'gemini', 'import', 'api')),
  CHECK (freshness IN ('current_state', 'historical_fact', 'timeless', 'temporary')),
  CHECK (
    array_position(ARRAY['public', 'normal', 'private', 'secret'], summary_sensitivity)
    >= array_position(ARRAY['public', 'normal', 'private', 'secret'], sensitivity)
  ),
  CHECK (status IN ('active', 'superseded', 'expired', 'deleted', 'pending_confirmation'))
);

-- One active memory per refresh slot (§14.2).
CREATE UNIQUE INDEX uq_memories_active_slot
  ON memories (tenant_id, owner_id, scope, subject, predicate)
  WHERE status = 'active' AND predicate IS NOT NULL;

CREATE INDEX ix_memories_recall ON memories (tenant_id, owner_id, scope, status);
CREATE INDEX ix_memories_tags ON memories USING GIN (tags);
CREATE INDEX ix_memories_ttl ON memories (ttl) WHERE ttl IS NOT NULL;

CREATE TABLE memory_embeddings (
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  embedding VECTOR NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'summary_preview',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (memory_id, embedding_model, source_kind),
  CHECK (embedding_dimension > 0),
  CHECK (source_kind IN ('summary_preview', 'redacted_summary', 'full_summary')),
  CHECK (sensitivity IN ('public', 'normal', 'private', 'secret'))
);

CREATE TABLE memory_policies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  subject_type TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow',
  action TEXT NOT NULL,
  platform TEXT NOT NULL,
  client_id TEXT,
  scope TEXT,
  purpose TEXT,
  memory_type TEXT,
  tag TEXT,
  max_sensitivity TEXT NOT NULL DEFAULT 'normal',
  injection_mode TEXT NOT NULL DEFAULT 'confirm',
  precedence INTEGER NOT NULL DEFAULT 100,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effect IN ('allow', 'deny')),
  CHECK (action IN ('create', 'read', 'update', 'delete', 'inject', 'export')),
  CHECK (subject_type IN ('user', 'team', 'org', 'client', 'api_token', 'mcp_server')),
  CHECK (max_sensitivity IN ('public', 'normal', 'private', 'secret')),
  CHECK (injection_mode IN ('auto', 'confirm', 'manual_only', 'never'))
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID NOT NULL,
  client_id TEXT,
  platform TEXT,
  memory_ids UUID[] NOT NULL DEFAULT '{}',
  purpose TEXT,
  decision_id TEXT,
  decision TEXT,
  policy_version TEXT,
  redaction_applied BOOLEAN NOT NULL DEFAULT false,
  content_access_level TEXT NOT NULL DEFAULT 'none',
  prev_hash BYTEA,
  row_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN (
    'memory.created', 'memory.updated', 'memory.deleted', 'memory.superseded',
    'memory.retrieved', 'memory.injected', 'memory.redacted',
    'policy.changed', 'export.created')),
  CHECK (content_access_level IN ('none', 'preview', 'summary', 'full'))
);

CREATE INDEX ix_audit_tenant_time ON audit_events (tenant_id, created_at);
CREATE INDEX ix_audit_decision ON audit_events (decision_id);

CREATE TABLE pending_confirmations (
  token TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  kind TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  memory_ids UUID[] NOT NULL,
  payload_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (kind IN ('inject', 'refresh')),
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired'))
);
