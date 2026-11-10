#!/usr/bin/env node
/**
 * Seeds Jasfer Hosting: hosting plans, the bootstrap admin account and the
 * infrastructure nodes described by the environment.
 *
 * Safe to re-run - every insert is an upsert keyed on a stable slug/id.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { encryptSecret } from '../src/lib/crypto.mjs';

const dbPath = process.env.JASFER_DB_PATH || './data/jasfer.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.resolve('src/lib/schema.sql'), 'utf8'));

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
const plans = [
  {
    id: 'plan_free',
    slug: 'free',
    name: 'Free',
    description: 'A real Minecraft server to play with friends. Community support.',
    price_cents: 0,
    ram_mb: 1024,
    cpu_percent: 100,
    storage_mb: 5120,
    max_servers: 1,
    is_free: 1,
    sort_order: 1,
    features: [
      '1 Minecraft server',
      '1 GB RAM · 100% CPU',
      '5 GB NVMe storage',
      'Paper, Purpur, Vanilla, Fabric, Forge',
      'Full file manager + console',
      'Community support',
    ],
  },
  {
    id: 'plan_starter',
    slug: 'starter',
    name: 'Starter',
    description: 'Smoother ticks for small friend groups and modpacks.',
    price_cents: 399,
    ram_mb: 2048,
    cpu_percent: 150,
    storage_mb: 15360,
    max_servers: 2,
    is_free: 0,
    sort_order: 2,
    features: [
      '2 Minecraft servers',
      '2 GB RAM · 150% CPU',
      '15 GB NVMe storage',
      'One-click plugin + mod installs',
      'Automated backups',
      'Priority support',
    ],
  },
  {
    id: 'plan_pro',
    slug: 'pro',
    name: 'Pro',
    description: 'Public servers, big modpacks and heavier plugins.',
    price_cents: 799,
    ram_mb: 4096,
    cpu_percent: 250,
    storage_mb: 40960,
    max_servers: 3,
    is_free: 0,
    sort_order: 3,
    features: [
      '3 Minecraft servers',
      '4 GB RAM · 250% CPU',
      '40 GB NVMe storage',
      'Bedrock cross-play support',
      'Hourly backups',
      'Priority support',
    ],
  },
  {
    id: 'plan_network',
    slug: 'network',
    name: 'Network',
    description: 'For networks and communities running several worlds.',
    price_cents: 1499,
    ram_mb: 8192,
    cpu_percent: 400,
    storage_mb: 102400,
    max_servers: 6,
    is_free: 0,
    sort_order: 4,
    features: [
      '6 Minecraft servers',
      '8 GB RAM · 400% CPU',
      '100 GB NVMe storage',
      'Dedicated node placement',
      'Hourly backups + snapshots',
      'Priority support',
    ],
  },
];

const upsertPlan = db.prepare(`
  INSERT INTO plans (id, slug, name, description, price_cents, ram_mb, cpu_percent, storage_mb, max_servers, is_free, features, sort_order, active)
  VALUES (@id, @slug, @name, @description, @price_cents, @ram_mb, @cpu_percent, @storage_mb, @max_servers, @is_free, @features, @sort_order, 1)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name, description = excluded.description, price_cents = excluded.price_cents,
    ram_mb = excluded.ram_mb, cpu_percent = excluded.cpu_percent, storage_mb = excluded.storage_mb,
    max_servers = excluded.max_servers, is_free = excluded.is_free, features = excluded.features,
    sort_order = excluded.sort_order, updated_at = datetime('now')
`);

for (const plan of plans) {
  upsertPlan.run({ ...plan, features: JSON.stringify(plan.features) });
}

// ---------------------------------------------------------------------------
// Admin account
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@jasfer.host').toLowerCase();
// Never fall back to a published default password: generate a random one and
// print it once so the operator can sign in and change it.
const generatedAdminPassword = crypto.randomBytes(12).toString('base64url');
const adminPassword = process.env.ADMIN_PASSWORD || generatedAdminPassword;
const adminName = process.env.ADMIN_NAME || 'Jasfer Admin';
const freePlanId = db.prepare('SELECT id FROM plans WHERE slug = ?').get('free')?.id ?? null;

const existingAdmin = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, status, plan_id)
     VALUES (?, ?, ?, ?, 'admin', 'active', ?)`
  ).run(`usr_${crypto.randomBytes(8).toString('hex')}`, adminEmail, adminName, hashPassword(adminPassword), freePlanId);
  console.log(`[seed] created admin ${adminEmail}`);
  if (adminPassword === generatedAdminPassword) {
    console.log(`[seed] generated admin password: ${adminPassword}`);
    console.log('[seed] set ADMIN_PASSWORD to choose your own, and change it after first login');
  } else {
    console.log('[seed] password taken from ADMIN_PASSWORD - change it after first login');
  }
} else {
  console.log(`[seed] admin ${adminEmail} already exists - left untouched`);
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
const totalRamMb = Math.floor(os.totalmem() / 1024 / 1024);

if (process.env.JASFER_LOCAL_PROVIDER !== 'false') {
  const capacity = Number(process.env.JASFER_NODE_RAM_MB || Math.max(1024, Math.min(totalRamMb, 8192)));
  const storage = Number(process.env.JASFER_NODE_STORAGE_MB || 20480);
  db.prepare(
    `INSERT INTO nodes (id, name, provider, location, capacity_ram_mb, capacity_storage_mb, active, status, status_message)
     VALUES ('node_local', 'Jasfer Local Node', 'local', 'this-machine', ?, ?, 1, 'unverified', NULL)
     ON CONFLICT(id) DO UPDATE SET capacity_ram_mb = excluded.capacity_ram_mb,
       capacity_storage_mb = excluded.capacity_storage_mb, updated_at = datetime('now')`
  ).run(capacity, storage);
  console.log(`[seed] local node ready (${capacity} MB RAM capacity)`);
}

const pteroUrl = process.env.PTERODACTYL_PANEL_URL;
const pteroApp = process.env.PTERODACTYL_APPLICATION_KEY;
const pteroClient = process.env.PTERODACTYL_CLIENT_KEY;

if (pteroUrl && pteroApp && pteroClient) {
  db.prepare(
    `INSERT INTO nodes (id, name, provider, location, api_url, api_key_enc, client_key_enc,
       pterodactyl_node_id, nest_id, egg_id, capacity_ram_mb, capacity_storage_mb, active, status)
     VALUES ('node_ptero', 'Pterodactyl Node', 'pterodactyl', ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 'unverified')
     ON CONFLICT(id) DO UPDATE SET api_url = excluded.api_url, api_key_enc = excluded.api_key_enc,
       client_key_enc = excluded.client_key_enc, updated_at = datetime('now')`
  ).run(
    pteroUrl.replace(/\/$/, ''),
    pteroUrl.replace(/\/$/, ''),
    encryptSecret(pteroApp),
    encryptSecret(pteroClient),
    Number(process.env.PTERODACTYL_NODE_ID || 1),
    Number(process.env.PTERODACTYL_NEST_ID || 1),
    Number(process.env.PTERODACTYL_EGG_ID || 1)
  );
  console.log('[seed] Pterodactyl node configured from environment');
} else {
  console.log('[seed] Pterodactyl node not configured (optional) - add keys in the admin dashboard');
}

db.close();
console.log('[seed] done');
