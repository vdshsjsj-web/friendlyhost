# Jasfer Hosting

A complete, self-hostable **Minecraft server hosting platform** — custom panel, real backend, real
process control. Dark purple + black, mobile-first, open source.

Jasfer Hosting is not a mockup: when you press **Start**, the API asks the provider adapter to launch a
real Minecraft server process and the panel streams that process's stdout over a WebSocket. If no
infrastructure is connected, the UI says so plainly instead of pretending.

---

## What's inside

| Area | Implementation |
| --- | --- |
| Panel UI | Next.js 15 (App Router) + Tailwind CSS, custom design system, mobile-first |
| API | Next.js Route Handlers (REST, JSON, Zod-validated) |
| Console | `ws` WebSocket server in `server.js`, session-cookie authenticated |
| Database | SQLite (better-sqlite3) with an idempotent schema + seed |
| Auth | Email/password (scrypt) + Google OAuth, HttpOnly session cookies |
| Providers | `local` (real Java process on this host) and `pterodactyl` (Application + Client API) |
| Plugins/Mods | Modrinth search + `.jar` install into the server's `plugins`/`mods` folder |
| Files | Browse, edit, create, rename, delete inside the server directory (path-traversal guarded) |

---

## Features

**User dashboard**

- Signup, login, logout, Google sign-in
- Create servers with software (Paper, Purpur, Vanilla, Fabric, Forge), Java/Bedrock edition and a live
  version list fetched from the official APIs
- Server cards with name, IP:port (click to copy), status, player count
- Start / Stop / Restart with optimistic UI and real state feedback
- Live console: real stdout, command input, reconnect handling, autoscroll
- File manager: browse folders, edit text files in place, create folders, rename, delete
- Plugin & mod manager: search Modrinth, install into the right folder, remove installed files
- RAM / CPU / storage / uptime readouts from the actual process
- Activity log of every control action
- Plans & limits page showing what your plan allows and what you've used

**Admin dashboard**

- Platform overview: users, servers, running count, nodes, allocated RAM, infrastructure health
- Users: search, suspend/activate, promote to admin, assign plans, reset password, delete
- Servers: power actions, suspend/activate, delete, filter by owner
- Plans: full CRUD with RAM, CPU %, storage, max servers, price, features
- Nodes: add/edit/delete local or Pterodactyl nodes, encrypted API keys, live connection test
- Activity feed across the whole platform

**Enforced limits** — plan limits are checked in the create-server API and in the provider adapters,
not just hidden in the UI. Suspended accounts and suspended servers are rejected by the API.

---

## Quick start

```bash
git clone <your-repo> jasfer-hosting
cd jasfer-hosting
npm install            # also runs the schema migration
cp .env.example .env   # then edit the values
npm run dev            # http://localhost:3000
```

`npm install` runs `scripts/migrate.mjs`; the server also calls `ensureDatabase()` on boot, so the
database and default plans are created automatically.

Create your first admin:

```bash
npm run seed:admin -- you@example.com "Your Name" "a-strong-password"
```

Or register normally and promote yourself:

```bash
sqlite3 data/jasfer.db "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

Then open `/admin` and add a node.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `JASFER_DB_PATH` | no | SQLite file path (default `./data/jasfer.db`) |
| `JASFER_SECRET` | **yes in production** | Session cookie signing secret |
| `JASFER_ENCRYPTION_KEY` | **yes for Pterodactyl** | AES-256-GCM key for node API keys |
| `NEXT_PUBLIC_APP_URL` | yes | Public URL, used for OAuth redirects |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `JASFER_LOCAL_PROVIDER` | no | `1`/`0` — enable the local Java runtime node |
| `JASFER_ADMIN_EMAILS` | no | Comma-separated emails auto-promoted to admin |
| `PORT` / `HOSTNAME` | no | Bind address (default `0.0.0.0:3000`) |

Secrets are read server-side only. Nothing sensitive is ever shipped to the browser: node API keys are
encrypted at rest and the API returns `hasApiKey: true/false` instead of the key.

---

## Architecture

```
Browser ──► Next.js pages / Route Handlers ──► SQLite
   │                 │
   │                 └──► Provider adapter ──► local Java process
   │                                      └──► Pterodactyl panel API
   └──► /api/servers/:id/console (WebSocket, cookie-authenticated)
```

- `src/lib/providers.ts` chooses a provider per server (its node) and exposes one interface:
  `provision`, `start`, `stop`, `restart`, `sendCommand`, `status`, `consoleHistory`, `attachConsole`,
  `listFiles`, `readFile`, `writeFile`, `mkdir`, `remove`, `rename`, `installPlugin`.
- `src/lib/local-runtime.mjs` owns real `java -jar` child processes, log ring buffers, player parsing
  from the server log, and CPU/RAM sampling.
- `src/lib/pterodactyl.mjs` talks to a Pterodactyl panel with the Application API (create/delete/power)
  and Client API (resources, websocket token, files).
- `server.js` hosts Next plus the console WebSocket; it authenticates with the same session cookie and
  authorizes per-server access before streaming.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md),
[`docs/SCHEMA.md`](docs/SCHEMA.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Minecraft support

- **Software:** Paper, Purpur, Vanilla, Fabric, Forge
- **Editions:** Java and Bedrock (Bedrock uses the official Bedrock dedicated server on the local node)
- **Versions:** fetched live from the projects' own APIs, so new releases appear without a code change

Bedrock servers on a Pterodactyl node require an egg that matches the edition; the adapter reports a
clear error instead of silently creating a Java server.

---

## Security notes

- Passwords hashed with scrypt (`node:crypto`), constant-time comparison
- Session tokens stored hashed; cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production
- Every mutating route re-checks the session, ownership and role server-side
- File API resolves paths against the server root and rejects traversal outside it
- Rate limiting on auth endpoints; login failures do not reveal whether an email exists
- Activity log records actor, action, detail and IP
- No third-party analytics, no paid APIs

This is a self-hosted panel: keep it behind HTTPS, set a strong `JASFER_SECRET`, and back up
`data/jasfer.db` plus the `data/servers` directory.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next + WebSocket server in development |
| `npm run build` / `npm start` | Production build / start |
| `npm run migrate` | Apply the schema (idempotent) |
| `npm run seed` | Insert default plans |
| `npm test` | Node test runner (`tests/`) |
| `npm run typecheck` | `tsc --noEmit` |

---

## License

MIT. Minecraft is a trademark of Mojang Studios; this project is not affiliated with Mojang,
Microsoft or Pterodactyl.
