import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { config } from '@/lib/config';
import { clearSessionCookie } from '@/lib/auth';
import { errorResponse, json } from '@/lib/api';
import { hashToken } from '@/lib/crypto.mjs';

export async function POST() {
  try {
    const store = await cookies();
    const token = store.get(config.session.cookieName)?.value;
    if (token) {
      getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    }
    await clearSessionCookie();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
