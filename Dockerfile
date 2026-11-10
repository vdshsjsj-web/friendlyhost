# Jasfer Hosting — production image.
# Node 22 LTS: supported until 2027-04-30 and has prebuilt better-sqlite3 binaries.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Distributor fixes for the base OS, plus the toolchain needed if a native
# module has to compile from source.
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
RUN npm run build

EXPOSE 3000

# server.js serves Next.js and upgrades /api/servers/:id/console to WebSocket.
# It binds 0.0.0.0 and runs migrations + seeds on boot.
CMD ["node", "server.js"]
