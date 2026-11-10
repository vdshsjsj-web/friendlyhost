#!/usr/bin/env node
/**
 * Static audit for better-sqlite3 bindings.
 *
 * better-sqlite3 throws "Too many parameter values were provided" (and
 * "Too few parameter values were provided") when the number of values handed
 * to .run()/.get()/.all() does not match the number of `?` placeholders in the
 * prepared statement. This script parses every `.prepare(sql)` call in src/,
 * counts the placeholders and the top-level arguments of the chained call, and
 * fails when they disagree.
 *
 * Usage: node scripts/check-db-bindings.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Returns the index of the paren that closes the one at `open`. */
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Splits a call's argument text on top-level commas. */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        current += text[i];
        if (text[i] === '\\') {
          i += 1;
          current += text[i] ?? '';
        }
        i += 1;
      }
      current += text[i] ?? '';
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

const problems = [];
const skipped = [];
let checked = 0;

for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  let index = text.indexOf('.prepare(');
  while (index !== -1) {
    const open = index + '.prepare'.length;
    const close = matchParen(text, open);
    if (close === -1) break;
    const sql = text.slice(open + 1, close);
    const line = text.slice(0, index).split('\n').length;

    // Skip statements built by concatenation: the placeholder count is not
    // knowable statically (e.g. listActivity builds its WHERE clause).
    if (sql.includes('${') || !/['"`]/.test(sql)) {
      skipped.push(`${rel}:${line} dynamic SQL`);
      index = text.indexOf('.prepare(', close);
      continue;
    }

    const placeholders = (sql.match(/\?/g) ?? []).length;

    let cursor = close + 1;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    const chained = /^\.(run|get|all)\s*\(/.exec(text.slice(cursor, cursor + 12));
    if (!chained) {
      skipped.push(`${rel}:${line} prepared then bound elsewhere`);
      index = text.indexOf('.prepare(', close);
      continue;
    }

    const callOpen = cursor + chained[0].length - 1;
    const callClose = matchParen(text, callOpen);
    if (callClose === -1) break;
    const rawArgs = text.slice(callOpen + 1, callClose).trim();
    if (rawArgs.includes('...')) {
      skipped.push(`${rel}:${line} spread arguments`);
      index = text.indexOf('.prepare(', callClose);
      continue;
    }
    const args = rawArgs ? splitArgs(rawArgs) : [];
    checked += 1;
    if (args.length !== placeholders) {
      problems.push({
        file: rel,
        line,
        method: chained[1],
        placeholders,
        values: args.length,
        detail:
          args.length > placeholders
            ? 'Too many parameter values were provided'
            : 'Too few parameter values were provided',
        sql: sql.replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
    index = text.indexOf('.prepare(', callClose);
  }
}

for (const problem of problems) {
  console.error(
    `✗ ${problem.file}:${problem.line} ${problem.method}() — ${problem.placeholders} placeholder(s), ${problem.values} value(s): ${problem.detail}\n    ${problem.sql}`
  );
}

console.log(
  `\nChecked ${checked} bound statement(s); ${skipped.length} skipped (dynamic SQL / spread); ${problems.length} mismatch(es).`
);
if (skipped.length) console.log(`Skipped: ${skipped.join('; ')}`);
process.exit(problems.length ? 1 : 0);
