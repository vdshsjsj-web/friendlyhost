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

The repository `Dockerfile` is the source of truth. It is a two-stage **Alpine (musl)** build on
Node 22 LTS: the builder installs `python3 make g++` so `better-sqlite3` can compile, then
`npm prune --omit=dev` removes the toolchain, and the runtime stage ships only the compiled app plus
production dependencies, running as the unprivileged `node` user.

```dockerfile
FROM node:22-alpine AS builder
RUN apk upgrade --no-cache && apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY src/lib/schema.sql ./src/lib/schema.sql
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk upgrade --no-cache \
 && apk add --no-cache unzip bash \
 && (apk add --no-cache openjdk21-jre-headless || apk add --no-cache openjdk17-jre-headless)
WORKDIR /app
COPY --from=builder /app ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t jasfer-hosting .
docker run -p 3000:3000 -v jasfer-data:/app/data --env-file .env jasfer-hosting
```

Mount `/app/data` so the database and server files survive restarts.

**Java is bundled.** The runtime stage installs `openjdk21-jre-headless` (falling back to Java 17) plus
`bash` for Forge's generated `run.sh` and `unzip` for the Bedrock archive, so the local provider really
launches `java -jar` processes. Set `JAVA_BIN` to use a different binary.

Memory still matters: a running Minecraft server needs its `-Xmx` plus roughly 300–600 MB of JVM and OS
overhead. The node refuses to start a server it cannot fit and reports the available memory, so on a 1 GB
app allocation use Pterodactyl nodes (or a dedicated host, section 3) rather than the web container.

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
- [ ] Java runtime available (bundled in the image; check Admin → Nodes → Test)

## Scaling notes

SQLite and a single process handle a few hundred light servers on one box. For more, move servers to
Pterodactyl nodes (the panel stays stateless apart from SQLite) and put several panel instances behind
a load balancer only after moving the database to a server-grade engine — the adapter layer is the
integration point, not the UI.
