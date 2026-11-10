-- ===========================================================================
-- Jasfer Hosting - database schema (SQLite)
-- Applied idempotently by `npm run migrate` and on server boot.
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Hosting plans: what a user is allowed to create.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  price_cents    INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  ram_mb         INTEGER NOT NULL,
  cpu_percent    INTEGER NOT NULL DEFAULT 100,
  storage_mb     INTEGER NOT NULL,
  max_servers    INTEGER NOT NULL DEFAULT 1,
  is_free        INTEGER NOT NULL DEFAULT 0,
  features       TEXT NOT NULL DEFAULT '[]',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Users + sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  password_hash  TEXT,
  google_id      TEXT UNIQUE,
  avatar_url     TEXT,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  plan_id        TEXT REFERENCES plans(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Short-lived OAuth CSRF states (Google sign-in).
CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  redirect_to TEXT NOT NULL DEFAULT '/dashboard',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Nodes: real infrastructure the panel can talk to.
-- provider = 'local'       -> child process managed by this app
-- provider = 'pterodactyl' -> Pterodactyl/Pelican-compatible panel API
-- API keys are stored AES-256-GCM encrypted (see src/lib/crypto.mjs).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodes (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  provider            TEXT NOT NULL CHECK (provider IN ('local','pterodactyl')),
  location            TEXT NOT NULL DEFAULT 'auto',
  api_url             TEXT,
  api_key_enc         TEXT,
  client_key_enc      TEXT,
  pterodactyl_node_id INTEGER,
  nest_id             INTEGER,
  egg_id              INTEGER,
  capacity_ram_mb     INTEGER NOT NULL DEFAULT 0,
  capacity_storage_mb INTEGER NOT NULL DEFAULT 0,
  active              INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'unverified',
  status_message      TEXT,
  last_checked_at     TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Servers owned by users. `provider_server_id` is the identifier on the node.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id            TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  plan_id            TEXT REFERENCES plans(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  software           TEXT NOT NULL CHECK (software IN ('paper','purpur','vanilla','fabric','forge')),
  version            TEXT NOT NULL,
  edition            TEXT NOT NULL DEFAULT 'java' CHECK (edition IN ('java','bedrock')),
  ram_mb             INTEGER NOT NULL,
  cpu_percent        INTEGER NOT NULL DEFAULT 100,
  storage_mb         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'provisioning'
                     CHECK (status IN ('provisioning','offline','starting','running','stopping','suspended','error')),
  status_message     TEXT,
  provider_server_id TEXT,
  ip                 TEXT,
  port               INTEGER,
  motd               TEXT NOT NULL DEFAULT 'A Jasfer Hosting server',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  last_status_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_node ON servers(node_id);

-- ---------------------------------------------------------------------------
-- Installed plugins / mods (from Modrinth or uploaded by the user).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS server_plugins (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  project_id   TEXT,
  name         TEXT NOT NULL,
  version      TEXT,
  source       TEXT NOT NULL DEFAULT 'modrinth',
  file_name    TEXT NOT NULL,
  installed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plugins_server ON server_plugins(server_id);

-- ---------------------------------------------------------------------------
-- Audit trail shown to users (their servers) and admins (everything).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  server_id  TEXT REFERENCES servers(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_server ON activity(server_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);

-- ---------------------------------------------------------------------------
-- Key/value platform settings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
