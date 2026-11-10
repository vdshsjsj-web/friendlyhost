#!/usr/bin/env node
/**
 * Jasfer Hosting server entrypoint.
 *
 * Next.js handles pages + REST API. This file adds the one thing Next cannot:
 * a WebSocket endpoint at /api/servers/:id/console that streams the *real*
 * console of the server process (local node) or the Pterodactyl console.
 *
 * Authentication happens here with the same session cookie the REST API uses.
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';
import path from 'node:path';
import Database from 'better-sqlite3';
import next from 'next';
import { WebSocketServer } from 'ws';
import { hashToken, decryptSecret } from './src/lib/crypto.mjs';
import { ensureDatabase } from './scripts/boot.mjs';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '0.0.0.0';

process.env.NODE_ENV = dev ? 'development' : 'production';

// Create/migrate/seed the database before anything else touches it.
ensureDatabase();

const dbPath = process.env.JASFER_DB_PATH || './data/jasfer.db';
let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare('SELECT 1 FROM sessions LIMIT 1').get();
} catch (error) {
  console.error(
    `\n[jasfer] The database at ${dbPath} is not ready.\n` +
      `[jasfer] Run "npm run migrate && npm run seed" first.\n` +
      `[jasfer] ${error.message}\n`
  );
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const COOKIE_NAME = 'jasfer_session';

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index > 0) acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return acc;
  }, {});
}

function authenticate(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const session = db
    .prepare(
      `SELECT u.id, u.role, u.status, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .get(hashToken(token));
  if (!session || session.status !== 'active') return null;
  return session;
}

function authorizeServer(user, serverId) {
  const server = db
    .prepare(
      `SELECT s.*, n.provider AS node_provider, n.api_url, n.api_key_enc, n.client_key_enc
       FROM servers s LEFT JOIN nodes n ON n.id = s.node_id WHERE s.id = ?`
    )
    .get(serverId);
  if (!server) return { error: 'Server not found', code: 4404 };
  if (server.owner_id !== user.id && user.role !== 'admin') return { error: 'Not your server', code: 4403 };
  return { server };
}

async function localRuntime() {
  // Imported from the same absolute path the API routes use, so the module
  // registry (running processes, console buffers) is shared.
  const url = new URL('./src/lib/local-runtime.mjs', import.meta.url).href;
  return import(url);
}

async function attachLocal(ws, serverId, send) {
  const rt = await localRuntime();
  const history = await rt.consoleHistory(serverId);
  send({ type: 'history', lines: history });
  const status = await rt.status(serverId);
  send({ type: 'status', status });

  const unsubscribe = await rt.attachConsole(serverId, (message) => {
    if (ws.readyState === ws.OPEN) send(message);
  });

  const poll = setInterval(async () => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      send({ type: 'stats', status: await rt.status(serverId) });
    } catch {
      /* ignore */
    }
  }, 5000);

  return {
    sendCommand: (command) => rt.sendCommand(serverId, command),
    dispose: () => {
      unsubscribe?.();
      clearInterval(poll);
    },
  };
}

async function attachPterodactyl(ws, server, send) {
  const { createPterodactyl } = await import(new URL('./src/lib/pterodactyl.mjs', import.meta.url).href);
  const client = createPterodactyl({
    url: server.api_url || '',
    applicationKey: decryptSecret(server.api_key_enc) || '',
    clientKey: decryptSecret(server.client_key_enc) || '',
  });
  const session = await client.attachConsole(server.provider_server_id, {
    onLine: (line) => ws.readyState === ws.OPEN && send({ type: 'line', line }),
    onStatus: (state) => ws.readyState === ws.OPEN && send({ type: 'status', status: { state } }),
  });
  session.onClose(() => {
    if (ws.readyState === ws.OPEN) {
      send({ type: 'error', message: 'Panel console socket closed. Reconnecting is up to you - refresh to retry.' });
    }
  });
  return {
    sendCommand: (command) => session.sendCommand(command),
    dispose: () => session.close(),
  };
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true);
    const match = pathname?.match(/^\/api\/servers\/([^/]+)\/console$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const user = authenticate(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const { server: serverRow, error, code } = authorizeServer(user, decodeURIComponent(match[1]));
    if (error) {
      socket.write(`HTTP/1.1 ${code === 4403 ? '403 Forbidden' : '404 Not Found'}\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, serverRow);
    });
  });

  wss.on('connection', async (ws, req, serverRow) => {
    const send = (payload) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
    };
    let attachment = null;
    try {
      if (serverRow.node_provider === 'pterodactyl') {
        attachment = await attachPterodactyl(ws, serverRow, send);
      } else {
        attachment = await attachLocal(ws, serverRow.id, send);
      }
      send({ type: 'connected', serverId: serverRow.id, provider: serverRow.node_provider || 'none' });
    } catch (error) {
      send({ type: 'error', message: error.message || 'Could not attach to the server console' });
    }

    ws.on('message', async (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (payload.type === 'command' && attachment) {
        try {
          await attachment.sendCommand(payload.command);
        } catch (error) {
          send({ type: 'error', message: error.message });
        }
      }
      if (payload.type === 'ping') send({ type: 'pong' });
    });

    ws.on('close', () => {
      try {
        attachment?.dispose();
      } catch {
        /* ignore */
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`[jasfer] Jasfer Hosting ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`);
    console.log(`[jasfer] console websocket: ws://${hostname}:${port}/api/servers/:id/console`);
  });
});
