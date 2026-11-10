import path from 'node:path';

export const config = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dbPath: process.env.JASFER_DB_PATH || './data/jasfer.db',
  serversDir: path.resolve(process.env.JASFER_SERVERS_DIR || './data/servers'),
  localProviderEnabled: process.env.JASFER_LOCAL_PROVIDER !== 'false',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    get enabled() {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
    redirectUri: `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/auth/google/callback`,
  },
  session: {
    cookieName: 'jasfer_session',
    ttlDays: 30,
  },
};

export const BRAND = {
  name: 'Jasfer Hosting',
  short: 'Jasfer',
  tagline: 'Minecraft hosting that actually runs your world.',
  supportEmail: 'support@jasfer.host',
};
