# Jasfer Hosting — production image.
# Alpine (musl) instead of Debian: the Debian bases ship glibc/acl/attr packages
# with unfixed high/critical advisories, while Alpine's package set is minimal
# and patched. Two stages keep the compiler toolchain out of the shipped image.
# Node 22 LTS: supported to 2027-04-30 and compatible with better-sqlite3 11.x.

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS builder

ENV NEXT_TELEMETRY_DISABLED=1

# Compilers are only needed if better-sqlite3 has no prebuilt binary for the
# platform; they never reach the runtime image.
RUN apk upgrade --no-cache \
 && apk add --no-cache python3 make g++

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
FROM node:22-alpine AS runtime

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk upgrade --no-cache

WORKDIR /app

# Compiled app, production node_modules, migrations and schema, plus server.js
# (serves Next.js and upgrades /api/servers/:id/console to WebSocket).
COPY --from=builder /app ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "server.js"]
