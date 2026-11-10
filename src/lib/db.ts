import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

/**
 * Single SQLite connection per Node process.
 * WAL mode keeps reads fast while the panel writes console/activity rows.
 */
declare global {
  // eslint-disable-next-line no-var
  var __jasferDb: Database.Database | undefined;
}

function open(): Database.Database {
  const dbPath = path.resolve(config.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const schema = fs.readFileSync(path.join(process.cwd(), 'src/lib/schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__jasferDb) globalThis.__jasferDb = open();
  return globalThis.__jasferDb;
}

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  google_id: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  plan_id: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  ram_mb: number;
  cpu_percent: number;
  storage_mb: number;
  max_servers: number;
  is_free: number;
  features: string;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
};

export type NodeRow = {
  id: string;
  name: string;
  provider: 'local' | 'pterodactyl';
  location: string;
  api_url: string | null;
  api_key_enc: string | null;
  client_key_enc: string | null;
  pterodactyl_node_id: number | null;
  nest_id: number | null;
  egg_id: number | null;
  capacity_ram_mb: number;
  capacity_storage_mb: number;
  active: number;
  status: string;
  status_message: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServerRow = {
  id: string;
  owner_id: string;
  node_id: string | null;
  plan_id: string | null;
  name: string;
  software: 'paper' | 'purpur' | 'vanilla' | 'fabric' | 'forge';
  version: string;
  edition: 'java' | 'bedrock';
  ram_mb: number;
  cpu_percent: number;
  storage_mb: number;
  status: 'provisioning' | 'offline' | 'starting' | 'running' | 'stopping' | 'suspended' | 'error';
  status_message: string | null;
  provider_server_id: string | null;
  ip: string | null;
  port: number | null;
  motd: string;
  created_at: string;
  updated_at: string;
  last_status_at: string | null;
};

export type ActivityRow = {
  id: string;
  actor_id: string | null;
  user_id: string | null;
  server_id: string | null;
  action: string;
  detail: string;
  ip: string | null;
  created_at: string;
};

export type PluginRow = {
  id: string;
  server_id: string;
  project_id: string | null;
  name: string;
  version: string | null;
  source: string;
  file_name: string;
  installed_by: string | null;
  installed_at: string;
};

/** A row of `server_plugins`: a plugin/mod installed into one server. */
export type ServerPluginRow = PluginRow;
