# Jasfer Hosting — production image.
# Two stages so the compile toolchain (python3/g++) never ships in the final
# image: it is only needed if better-sqlite3 has to build from source.
# Base: Node 24 LTS (supported to 2028-04-30) on Debian 13 (trixie).

# ---------------------------------------------------------------- build stage
FROM node:24-trixie-slim AS builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# `npm ci` runs the postinstall migration, so the schema and scripts must be
# present before dependencies are installed.
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY src/lib/schema.sql ./src/lib/schema.sql

RUN npm ci

COPY . .

# NODE_ENV is still unset here, so `npm ci` above installed the devDependencies
# (typescript, tailwind) that `next build` needs. Prune them afterwards so the
# runtime stage only carries production dependencies.
RUN npm run build \
 && npm prune --omit=dev

# -------------------------------------------------------------- runtime stage
FROM node:24-trixie-slim AS runtime

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Distributor security fixes only — no compilers in the shipped image.
RUN apt-get update \
 && apt-get upgrade -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Compiled app, production node_modules, migrations and schema, plus server.js
# (serves Next.js and upgrades /api/servers/:id/console to WebSocket).
COPY --from=builder /app ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "server.js"]
