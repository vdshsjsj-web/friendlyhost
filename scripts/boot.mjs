#!/usr/bin/env node
/**
 * Ensures the SQLite database exists, is migrated and seeded before the panel
 * starts serving traffic. Runs the idempotent migrate + seed scripts.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = path.resolve(process.env.JASFER_DB_PATH || './data/jasfer.db');

export function ensureDatabase() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  let needsSeed = true;
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
    if (row) {
      const count = db.prepare('SELECT COUNT(*) AS n FROM plans').get();
      needsSeed = !count || count.n === 0;
    }
    db.close();
  } catch {
    needsSeed = true;
  }

  const run = (script) =>
    execFileSync(process.execPath, [path.resolve('scripts', script)], {
      stdio: 'inherit',
      env: { ...process.env, JASFER_DB_PATH: dbPath },
    });

  run('migrate.mjs');
  if (needsSeed) run('seed.mjs');
}
