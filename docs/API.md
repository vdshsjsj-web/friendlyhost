# Jasfer Hosting — API reference

Base URL: `NEXT_PUBLIC_APP_URL` (e.g. `https://panel.example.com`).
All endpoints are JSON. Authentication uses the `jasfer_session` HttpOnly cookie set by the auth
routes — send it with every request (`credentials: 'include'` from a browser, `-b` with curl).

Errors always look like:

```json
{ "error": "Human readable message", "details": { "field": ["reason"] } }
```

Status codes: `400` validation, `401` not signed in, `403` forbidden/suspended, `404` not found,
`409` conflict, `429` rate limited, `5xx` provider or internal failure.

---

## Auth

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | `{ name, email, password }` | `201 { user, plan }`, sets cookie |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ user, plan }`, sets cookie |
| `POST` | `/api/auth/logout` | — | `{ ok: true }`, clears cookie |
| `GET` | `/api/auth/me` | — | `{ user \| null, googleEnabled, plan \| null }` |
| `GET` | `/api/auth/google` | — | `302` to Google consent screen |
| `GET` | `/api/auth/google/callback` | — | `302` back to `/dashboard`, sets cookie |

`user` is `{ id, email, name, role, status, planId, avatarUrl, createdAt }` — never a password hash.
Signup and login are rate limited per IP; failed logins never disclose whether an email exists.

---

## Platform

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/platform` | `{ local: { enabled, java, capacity }, nodes: [...], ready, summary }` |
| `GET` | `/api/plans` | `{ plans: [...] }` — public, active plans only |
| `GET` | `/api/minecraft/versions?software=paper&edition=java` | `{ software, edition, versions: string[], recommended, meta }` |

`/api/platform` is how the UI knows whether a real node is connected. `ready` is false when neither the
local runtime nor any active Pterodactyl node is usable, and the panel says so instead of faking power
controls.

`software` ∈ `paper | purpur | vanilla | fabric | forge`; `edition` ∈ `java | bedrock`. Version lists are
fetched live from the upstream projects and cached in memory for a few minutes.

---

## Servers

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/servers` | — | `{ servers: [...], viewerId, isAdmin }` |
| `POST` | `/api/servers` | `{ name, software, edition, version, planId?, motd? }` | `201 { server }` |
| `GET` | `/api/servers/:id` | — | `{ server, plugins, activity }` |
| `PATCH` | `/api/servers/:id` | `{ name?, motd? }` | `{ server }` |
| `DELETE` | `/api/servers/:id` | — | `{ ok: true }` |
| `POST` | `/api/servers/:id/power` | `{ action: 'start' \| 'stop' \| 'restart' \| 'kill' }` | `{ ok, status }` |

Server objects returned to the browser:

```json
{
  "id": "srv_...",
  "name": "Survival SMP",
  "software": "paper",
  "version": "1.21.4",
  "edition": "java",
  "status": "running",
  "statusMessage": null,
  "ip": "203.0.113.10",
  "port": 25571,
  "motd": "A Jasfer server",
  "ramMb": 2048,
  "cpuPercent": 100,
  "storageMb": 10240,
  "plan": { "id": "plan_free", "name": "Free", "ramMb": 2048, "storageMb": 10240, "maxServers": 1 },
  "node": { "id": "node_local", "name": "Local", "provider": "local", "location": "auto" }
}
```

`POST /api/servers` enforces the plan: max server count, RAM, CPU and storage limits are validated
server-side and re-checked by the provider adapter. A suspended account cannot create servers.
Creation is asynchronous from the client's point of view: the API provisions the directory, downloads
the server jar and records `status: 'stopped'`; nothing claims to be running until it is.

### Console WebSocket

```
ws(s)://<host>/api/servers/:id/console
```

Authenticated with the same session cookie. Server → client frames:

```json
{ "type": "connected", "message": "Attached to local node" }
{ "type": "history", "lines": ["[12:00:00] Starting minecraft server version 1.21.4"] }
{ "type": "line", "line": "[12:00:04] Done (3.214s)! For help, type \"help\"" }
{ "type": "status", "status": { "state": "running", "message": null } }
{ "type": "stats", "status": { "cpuPercent": 12.4, "ramUsedMb": 890, "playerCount": 3 } }
{ "type": "error", "message": "This server is suspended." }
```

Client → server frames:

```json
{ "type": "command", "command": "say hello" }
{ "type": "ping" }
```

The socket only streams output from a real process (or the Pterodactyl console stream). If no provider
is reachable the connection is closed with an explanatory `error` frame.

---

## Files

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/servers/:id/files?path=/` | — | `{ path, entries: [...] }` |
| `GET` | `/api/servers/:id/files/content?path=/server.properties` | — | `{ path, content, truncated }` |
| `PUT` | `/api/servers/:id/files/content` | `{ path, content }` | `{ ok: true }` |
| `POST` | `/api/servers/:id/files` | `{ action: 'mkdir', path, name }` | `{ ok: true }` |
| `POST` | `/api/servers/:id/files` | `{ action: 'rename', from, to }` | `{ ok: true }` |
| `POST` | `/api/servers/:id/files` | `{ action: 'delete', names: [...] }` | `{ ok: true }` |

`entries[]` is `{ name, path, type: 'file' | 'dir', size, modifiedAt }`. Paths are resolved inside the
server's own directory; any attempt to escape it is rejected with `400`. Text reads are capped and
flagged with `truncated: true` for very large files.

---

## Plugins & mods

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/plugins/search?q=sodium&software=fabric&version=1.21.4` | — | `{ results: [...] }` |
| `GET` | `/api/servers/:id/plugins` | — | `{ plugins: [...] }` |
| `POST` | `/api/servers/:id/plugins` | `{ projectId }` | `{ ok, plugin }` |
| `DELETE` | `/api/servers/:id/plugins?pluginId=plg_...` | — | `{ ok: true }` |

Search proxies Modrinth (free, no key). Installs resolve a compatible file, download it on the node into
`plugins/` (Paper/Purpur) or `mods/` (Fabric/Forge), and record it. Vanilla and Bedrock servers are
rejected with an explanation rather than a silent no-op.

---

## Admin (role `admin` required)

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/admin/overview` | — | `{ counts, resource, recentServers, activity, signups, platform }` |
| `GET` | `/api/admin/users?q=` | — | `{ users }` |
| `PATCH` | `/api/admin/users` | `{ userId, status?, role?, planId?, name?, password? }` | `{ user }` |
| `DELETE` | `/api/admin/users?userId=` | — | `{ ok: true }` |
| `GET` | `/api/admin/servers?q=` | — | `{ servers }` (with `owner_email`, `node_name`, `plan_name`) |
| `PATCH` | `/api/admin/servers` | `{ serverId, action }` | `{ ok }` |
| `GET` | `/api/admin/plans` | — | `{ plans }` |
| `POST` | `/api/admin/plans` | plan object (below) | `201 { plan }` |
| `PATCH` | `/api/admin/plans` | `{ id, ...partial }` | `{ plan }` |
| `DELETE` | `/api/admin/plans?id=` | — | `{ ok }` (archives a plan that still has users) |
| `GET` | `/api/admin/nodes` | — | `{ nodes, usage }` |
| `POST` | `/api/admin/nodes` | node object (below) | `201 { node }` |
| `PATCH` | `/api/admin/nodes` | `{ id, ...partial }` or `{ id, action: 'test' }` | `{ node, checks? }` |
| `DELETE` | `/api/admin/nodes?id=` | — | `{ ok }` (`409` while servers are attached) |

`PATCH /api/admin/servers` accepts `action` ∈ `suspend | activate | stop | start | restart | delete`.
Suspending stops the process and blocks user control until reactivated.

Plan object (camelCase in, snake_case out):

```json
{
  "name": "Premium",
  "slug": "premium",
  "description": "For bigger communities",
  "priceCents": 900,
  "ramMb": 6144,
  "cpuPercent": 200,
  "storageMb": 40960,
  "maxServers": 5,
  "isFree": false,
  "features": ["6 GB RAM", "40 GB NVMe", "5 servers"],
  "sortOrder": 2,
  "active": true
}
```

Node object:

```json
{
  "name": "Hetzner FSN1",
  "provider": "pterodactyl",
  "location": "Falkenstein, DE",
  "apiUrl": "https://panel.example.com",
  "apiKey": "ptla_...",
  "clientKey": "ptlc_...",
  "pterodactylNodeId": 1,
  "nestId": 1,
  "eggId": 1,
  "capacityRamMb": 32768,
  "capacityStorageMb": 512000,
  "active": true
}
```

Keys are encrypted with AES-256-GCM before storage and are **never** returned: reads expose only
`hasApiKey` / `hasClientKey`. Sending a blank key on `PATCH` keeps the stored value.
`PATCH { id, action: 'test' }` performs a real call against the panel (or checks the local Java runtime)
and persists the resulting `status` / `statusMessage`.
