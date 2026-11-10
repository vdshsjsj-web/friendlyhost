import { z } from 'zod';
import { getDb, type UserRow } from '@/lib/db';
import { verifyPassword, createSession, setSessionCookie, normalizeEmail, publicUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    assertRateLimit(`login:${ip}`, 12, 60_000);

    const { email, password } = schema.parse(await readJson(request));
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError('Email or password is incorrect.', 401);
    }
    if (user.status !== 'active') {
      throw new ApiError('This account is suspended. Contact an administrator to restore access.', 403);
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
    const session = createSession(user.id, { userAgent: request.headers.get('user-agent'), ip });
    await setSessionCookie(session.token, session.expires);
    logActivity({ actorId: user.id, userId: user.id, action: 'auth.login', detail: 'Signed in with email', ip });

    return json({ user: publicUser(user) });
  } catch (error) {
    return errorResponse(error);
  }
}
