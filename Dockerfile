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

# The local provider launches real `java -jar` processes. Without a JRE the
# child process failed with "spawn java ENOENT", so the runtime ships one:
# Java 21 is the minimum for Minecraft 1.20.5+ (Paper 1.21 requires it), with
# Java 17 as a fallback where 21 is unavailable on the base release.
# bash is needed by Forge's generated run.sh, unzip by the Bedrock archive.
RUN apk upgrade --no-cache \
 && apk add --no-cache unzip bash \
 && (apk add --no-cache openjdk21-jre-headless || apk add --no-cache openjdk17-jre-headless)

WORKDIR /app

# Compiled app, production node_modules, migrations and schema, plus server.js
# (serves Next.js and upgrades /api/servers/:id/console to WebSocket).
COPY --from=builder /app ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "server.js"]
