-- COLLECT PRO — schéma initial (SQL simple, portable vers PostgreSQL)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'forms',
  status TEXT NOT NULL DEFAULT 'active',
  fields_json TEXT NOT NULL,
  dedupe_field TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  auth_name TEXT,
  secret_enc TEXT,
  status TEXT NOT NULL DEFAULT 'configured',
  probe_json TEXT,
  probed_at INTEGER,
  validated INTEGER NOT NULL DEFAULT 0,
  import_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  data_json TEXT NOT NULL,
  dedupe_key TEXT,
  source_id INTEGER REFERENCES sources(id),
  external_id TEXT,
  import_job TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  deleted_at INTEGER
);
CREATE INDEX ix_sub_activity ON submissions(activity_id, created_at);
CREATE INDEX ix_sub_job ON submissions(import_job);
CREATE UNIQUE INDEX ux_sub_dedupe ON submissions(activity_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_sub_ext ON submissions(activity_id, source_id, external_id) WHERE external_id IS NOT NULL;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  result_json TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE TABLE sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  source_id INTEGER,
  job_id TEXT,
  activity_id TEXT,
  status TEXT NOT NULL,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT ''
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_audit_at ON audit_logs(at);
CREATE INDEX ix_sync_at ON sync_logs(at);
