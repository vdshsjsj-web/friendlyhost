#!/usr/bin/env node
/**
 * Applies src/lib/schema.sql to the SQLite database. Idempotent - safe to run
 * on every boot / deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.JASFER_DB_PATH || './data/jasfer.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const schemaPath = path.resolve('src/lib/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(schema);
db.prepare(
  `INSERT INTO settings (key, value) VALUES ('schema_version', '1')
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
).run();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);
db.close();

console.log(`[migrate] database ready at ${dbPath}`);
console.log(`[migrate] tables: ${tables.join(', ')}`);
