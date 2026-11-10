# Jasfer Hosting — architecture

## Request flow

```
Browser (Next.js App Router pages + client components)
   │
   ├── fetch('/api/...')  ──► Route Handlers (Zod validated) ──► lib/db.ts (SQLite)
   │                                        │
   │                                        └──► lib/providers.ts ──┬──► local-runtime.mjs ──► java -jar
   │                                                               └──► pterodactyl.mjs ──► panel API
   │
   └── WebSocket /api/servers/:id/console ──► server.js ──► provider.attachConsole()
```

Pages are server components: they read the session, load rows and render HTML. Anything interactive
(power buttons, console, file editor, plugin search, admin tables) is a client component that talks to
the REST API, so the same API is usable by scripts and future clients.

## Modules

| File | Responsibility |
| --- | --- |
| `server.js` | HTTP entrypoint: Next request handler + `ws` server for consoles, cookie auth, boot-time DB ensure |
| `scripts/boot.mjs` | `ensureDatabase()` — migrate + seed before the panel serves traffic |
| `scripts/migrate.mjs` | Applies `src/lib/schema.sql`, plus additive column migrations |
| `scripts/seed.mjs` | Default Free/Premium plans, bootstrap admin, optional Pterodactyl node |
| `src/lib/db.ts` | better-sqlite3 connection + row types |
| `src/lib/auth.ts` | Sessions, scrypt hashing, `requireUser` / `requireAdmin`, Google OAuth helpers |
| `src/lib/api.ts` | `json`, `readJson`, `ApiError`, `errorResponse`, rate limiting, client IP |
| `src/lib/audit.ts` | Activity log writer |
| `src/lib/crypto.mjs` | Token hashing, AES-256-GCM encrypt/decrypt for node keys, id generation |
| `src/lib/providers.ts` | Provider selection per node + the shared adapter interface |
| `src/lib/local-runtime.mjs` | Real Java/Bedrock child processes, log ring buffer, player + resource sampling |
| `src/lib/pterodactyl.mjs` | Pterodactyl Application + Client API adapter |
| `src/lib/minecraft.ts` | Software catalogue and live version resolution |
| `src/lib/plugins.ts` | Modrinth search + compatible-file resolution |
| `src/lib/server-access.ts` | Ownership/role checks and the public server shape |
| `src/lib/schema.sql` | The database schema (idempotent) |

## Provider adapter contract

Every provider implements the same interface, so routes never branch on infrastructure:

```ts
type Provider = {
  provision(server, opts): Promise<{ providerServerId, ip, port }>;
  destroy(server): Promise<void>;
  start(server): Promise<void>;
  stop(server): Promise<void>;
  restart(server): Promise<void>;
  sendCommand(server, command): Promise<void>;
  status(server): Promise<ServerStatus>;
  consoleHistory(server): Promise<string[]>;
  attachConsole(server, onLine): Promise<() => void>;
  listFiles(server, dir): Promise<FileEntry[]>;
  readFile(server, path): Promise<string>;
  writeFile(server, path, content): Promise<void>;
  mkdir(server, path, name): Promise<void>;
  remove(server, path, names): Promise<void>;
  rename(server, from, to): Promise<void>;
  deletePaths(server, dir, names): Promise<void>;
  installPlugin(server, { url, fileName, target }): Promise<void>;
};
```

`ServerStatus` is `{ state, message, players, playerCount, maxPlayers, cpuPercent, ramUsedMb,
uptimeSeconds, pid }`. The local runtime fills these from `/proc`-style sampling of the child process;
Pterodactyl fills them from its resources endpoint.

## Console streaming

`server.js` upgrades `/api/servers/:id/console`, resolves the session cookie, loads the server and checks
access, then subscribes to the provider stream. Frames are JSON:

- `history` — the buffered backlog so a reload keeps context
- `line` — one new stdout line
- `status` / `stats` — periodic state and resource snapshots
- `error` — a human-readable reason the stream cannot continue

Client frames are `{type:'command'}` and `{type:'ping'}`. Commands are forwarded to the real stdin (local)
or the panel's command endpoint (Pterodactyl). A suspended server refuses commands.

## Limits and permissions

- `users.role` ∈ `user | admin`; `users.status` ∈ `active | suspended`
- `plans` define `ram_mb`, `cpu_percent`, `storage_mb`, `max_servers`, `price_cents`
- Creation checks plan limits, count and account status; adapters re-validate RAM against node capacity
- Suspension is enforced in the API, not only in the UI
- Every mutation writes an `activity` row (actor, action, detail, IP)

## Honest failure states

The panel never fabricates server state:

- `/api/platform` reports whether the local runtime or any Pterodactyl node is actually reachable
- The landing page and dashboard render that state ("connected" / "setup required") from real data
- Power endpoints return the provider error verbatim; the UI shows it
- If a node has no Java runtime, the console panel says so instead of showing a fake log
