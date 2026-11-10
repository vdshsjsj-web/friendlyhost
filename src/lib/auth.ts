import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb, type UserRow } from './db';
import { config } from './config';
import { hashToken, randomId, randomToken } from './crypto.mjs';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const db = getDb();
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.session.ttlDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomId('ses'), userId, hashToken(token), meta.userAgent ?? null, meta.ip ?? null, expires);
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  return { token, expires };
}

export async function setSessionCookie(token: string, expires: Date | string) {
  const store = await cookies();
  store.set(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expires),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(config.session.cookieName, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(config.session.cookieName)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .get(hashToken(token)) as UserRow | undefined;
  if (!row || row.status !== 'active') return null;
  return row;
}

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('You need to sign in to do that.', 401);
  return user;
}

export async function requireAdmin(): Promise<UserRow> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new AuthError('Administrator access required.', 403);
  return user;
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatar_url,
    planId: user.plan_id,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    hasPassword: Boolean(user.password_hash),
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
