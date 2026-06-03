-- Core shared file table
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_by_email TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user_upload',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Virtual file system metadata
CREATE TABLE IF NOT EXISTS virtual_files (
  id UUID PRIMARY KEY,
  owner_email TEXT NOT NULL,
  parent_id UUID NULL REFERENCES virtual_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
  storage_key TEXT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content_type TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virtual_files_owner_parent
  ON virtual_files (owner_email, parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_files_unique_sibling_name
  ON virtual_files (owner_email, parent_id, lower(name));

-- Sharing grants
CREATE TABLE IF NOT EXISTS file_shares (
  id UUID PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES virtual_files(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  grantee_email TEXT NOT NULL,
  can_write BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (node_id, grantee_email)
);

CREATE INDEX IF NOT EXISTS idx_file_shares_grantee
  ON file_shares (grantee_email);

-- App passwords for WebDAV basic auth
CREATE TABLE IF NOT EXISTS app_passwords (
  id UUID PRIMARY KEY,
  user_email TEXT NOT NULL,
  label TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_passwords_user
  ON app_passwords (user_email)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_passwords_prefix
  ON app_passwords (token_prefix)
  WHERE revoked_at IS NULL;

-- WebDAV locks
CREATE TABLE IF NOT EXISTS webdav_locks (
  id UUID PRIMARY KEY,
  user_email TEXT NOT NULL,
  lock_path TEXT NOT NULL,
  depth TEXT NOT NULL,
  owner TEXT NULL,
  token TEXT NOT NULL UNIQUE,
  timeout_sec INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webdav_locks_path_exp
  ON webdav_locks (lock_path, expires_at);

CREATE INDEX IF NOT EXISTS idx_webdav_locks_user_exp
  ON webdav_locks (user_email, expires_at);
