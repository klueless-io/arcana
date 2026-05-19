export const DDL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  priority REAL NOT NULL DEFAULT 0.5,
  tier TEXT NOT NULL DEFAULT 'warm',
  decay_score REAL NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_latest INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  scopes TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  text TEXT NOT NULL,
  vector_id TEXT,
  layer TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  scopes TEXT
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL NOT NULL,
  shared_tags TEXT NOT NULL DEFAULT '[]',
  rationale TEXT,
  method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_verified_at TEXT
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  fact TEXT NOT NULL,
  entity TEXT NOT NULL,
  attribute TEXT,
  value TEXT,
  confidence REAL NOT NULL,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_reinforced_at TEXT,
  expires_at TEXT,
  is_latest INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  surprisal_score REAL,
  scopes TEXT
);

CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  fact_a_id TEXT NOT NULL,
  fact_b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rationale TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  entity_id TEXT,
  type TEXT NOT NULL,
  statement TEXT NOT NULL,
  supporting_fact_ids TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entity_profiles (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL UNIQUE,
  static_facts TEXT NOT NULL DEFAULT '[]',
  dynamic_context TEXT NOT NULL DEFAULT '',
  narrative_prose TEXT,
  related_entity_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS agent_self (
  id TEXT PRIMARY KEY,
  memory_blocks TEXT NOT NULL DEFAULT '[]',
  history TEXT NOT NULL DEFAULT '[]'
);
`;
