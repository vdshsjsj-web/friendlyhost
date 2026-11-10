# Jasfer Hosting — deployment guide

Jasfer Hosting is a single Node process: Next.js (App Router) plus a WebSocket server for consoles,
with SQLite for storage. There is no paid service in the critical path.

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| Node.js ≥ 20.9 (22 LTS or 24 LTS recommended) | `better-sqlite3` ships prebuilt binaries for these |
| Java 17+ (`java` on `PATH`) | only for the built-in local provider |
| 1 GB RAM free | the panel itself; each local Minecraft server needs its own RAM |
| A reverse proxy with WebSocket support | Caddy, nginx or the platform's own router |

Optional: a Pterodactyl panel (1.11+) if you want to place servers on remote nodes.

## 2. Install

```bash
git clone <your-repo> jasfer-hosting
cd jasfer-hosting
npm install          # also runs the schema migration via postinstall
cp .env.example .env # then edit
npm run seed         # default plans + bootstrap admin + optional Pterodactyl node
npm run build
npm start            # node server.js
```

`server.js` runs migrations and seeds on boot, so a fresh container only needs `npm run build` and
`npm start`. The panel listens on `PORT` (default `3000`) and binds all interfaces.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `JASFER_SECRET` | yes in production | 32+ random chars: session cookie signing and node-key encryption (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | yes | public base URL; used for OAuth redirects and absolute links |
| `PORT` | no | default `3000` |
| `JASFER_DB_PATH` | no | default `./data/jasfer.db` |
| `JASFER_SERVERS_DIR` | no | default `./data/servers` — where local servers live |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | enables the "Continue with Google" button |
| `JASFER_LOCAL_PROVIDER` | no | `false` disables the local Java provider |
| `JAVA_BIN` | no | default `java`; point at a specific JDK if needed |
| `PTERODACTYL_PANEL_URL`, `PTERODACTYL_APPLICATION_KEY`, `PTERODACTYL_CLIENT_KEY` | optional | seed a Pterodactyl node |
| `PTERODACTYL_NODE_ID`, `PTERODACTYL_EGG_ID`, `PTERODACTYL_NEST_ID` | optional | panel placement for that node |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | first run | bootstrap administrator created by `npm run seed` |

Change `ADMIN_PASSWORD` immediately after the first login. Never commit `.env`.

## 3. First login

1. Open `NEXT_PUBLIC_APP_URL`.
2. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Go to **Admin → Nodes**. The `Local` node is created automatically and reports whether a Java runtime
   was found. Use **Test** to re-check.
4. Go to **Admin → Plans** and tune Free/Premium limits (RAM, CPU, storage, server count).

The dashboard shows a **setup required** banner whenever no node is actually reachable. That is
intentional: the panel never pretends a server is running without a provider behind it.

## 4. Google authentication (optional)

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
2. Authorised redirect URI: `<NEXT_PUBLIC_APP_URL>/api/auth/google/callback`.
3. Put the client id/secret in `.env`, restart, and the button appears on `/login` and `/signup`.

Without these values the button stays hidden and email/password works normally.

## 5. Connecting Pterodactyl nodes (optional)

In the Pterodactyl panel:

1. **Admin → Application API** → create a key with `servers.read`, `servers.write`,
   `users.read`, `nodes.read`, `eggs.read`. This is the *application* key (`ptla_…`).
2. **Account → API Credentials** → create a key. This is the *client* key (`ptlc_…`).
3. Note the target node id, nest id and egg id for the Minecraft egg you use.

Then either set the `PTERODACTYL_*` variables and run `npm run seed`, or add the node in
**Admin → Nodes** with provider `pterodactyl`. Keys are encrypted with AES-256-GCM using
`JASFER_SECRET` before they are written to the database and are never sent back to the browser
(reads only report `hasApiKey` / `hasClientKey`). **Test** performs a real panel call.

Rotating `JASFER_SECRET` invalidates stored node keys — re-enter them afterwards.

## 6. Reverse proxy

WebSocket upgrades are required for the console.

Caddy:

```
panel.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 3600s;   # keep consoles open
}
```

`X-Forwarded-For` matters: rate limiting and the activity log use it. Behind a proxy, terminate TLS
there — the panel expects `https` in `NEXT_PUBLIC_APP_URL` for secure cookies.

## 7. systemd unit

```ini
[Unit]
Description=Jasfer Hosting
After=network.target

[Service]
Type=simple
User=jasfer
WorkingDirectory=/opt/jasfer-hosting
EnvironmentFile=/opt/jasfer-hosting/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 8. Docker (optional)

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
```

Mount `/app/data` so the database and server files survive restarts. The JRE is only needed for the
local provider; drop it if you use Pterodactyl nodes exclusively.

## 9. Backups and upgrades

```bash
sqlite3 data/jasfer.db ".backup 'backup-$(date +%F).db'"
tar -czf servers-$(date +%F).tar.gz data/servers
```

Upgrade: `git pull && npm install && npm run build && systemctl restart jasfer`. Migrations are
idempotent and additive, so they run safely on boot.

## 10. Operations checklist

- [ ] `JASFER_SECRET` set to 32+ random characters, `.env` not in Git
- [ ] `ADMIN_PASSWORD` changed from the seeded default
- [ ] `NEXT_PUBLIC_APP_URL` matches the public HTTPS URL
- [ ] Reverse proxy passes WebSocket upgrades (`/api/servers/:id/console`)
- [ ] Node **Test** succeeds in Admin → Nodes
- [ ] Plans reviewed for RAM/CPU/storage limits
- [ ] `data/` on a persistent volume, backups scheduled
- [ ] Java runtime installed if using the local provider

## Scaling notes

SQLite and a single process handle a few hundred light servers on one box. For more, move servers to
Pterodactyl nodes (the panel stays stateless apart from SQLite) and put several panel instances behind
a load balancer only after moving the database to a server-grade engine — the adapter layer is the
integration point, not the UI.
