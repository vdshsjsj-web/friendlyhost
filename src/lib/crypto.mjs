import crypto from 'node:crypto';

/**
 * Secret handling for Jasfer Hosting.
 *
 * - Node API keys are encrypted at rest with AES-256-GCM so a database dump
 *   never leaks panel credentials. They are only ever decrypted on the server.
 * - Session tokens are stored as SHA-256 hashes.
 */

const FALLBACK_SECRET = 'jasfer-development-secret-change-me';

export function getSecret() {
  const secret = process.env.JASFER_SECRET;
  if (!secret || secret.length < 16) return FALLBACK_SECRET;
  return secret;
}

export function hasStrongSecret() {
  const secret = process.env.JASFER_SECRET;
  return Boolean(secret && secret.length >= 32 && secret !== FALLBACK_SECRET);
}

function keyFromSecret() {
  return crypto.createHash('sha256').update(`jasfer:enc:${getSecret()}`).digest();
}

export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function randomId(prefix = '') {
  const raw = crypto.randomBytes(12).toString('hex');
  return prefix ? `${prefix}_${raw}` : raw;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
