import { z } from 'zod';
import { getDb, type PlanRow, type UserRow } from '@/lib/db';
import { hashPassword, createSession, setSessionCookie, normalizeEmail, publicUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { randomId } from '@/lib/crypto.mjs';

const schema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(60),
  email: z.string().trim().email('Enter a valid email address').max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    assertRateLimit(`signup:${ip}`, 10, 60_000);

    const body = await readJson(request);
    const { name, email, password } = schema.parse(body);
    const normalized = normalizeEmail(email);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized) as { id: string } | undefined;
    if (existing) {
      throw new ApiError('An account with that email already exists. Try signing in.', 409);
    }

    const freePlan = db
      .prepare('SELECT * FROM plans WHERE is_free = 1 AND active = 1 ORDER BY sort_order LIMIT 1')
      .get() as PlanRow | undefined;
    if (!freePlan) {
      throw new ApiError('No free plan is configured yet. Ask the administrator to seed hosting plans.', 409);
    }

    const userId = randomId('usr');
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, status, plan_id)
       VALUES (?, ?, ?, ?, 'user', 'active', ?)`
    ).run(userId, normalized, name, hashPassword(password), freePlan.id);

    const session = createSession(userId, { userAgent: request.headers.get('user-agent'), ip });
    await setSessionCookie(session.token, session.expires);
    logActivity({ actorId: userId, userId, action: 'account.created', detail: `Signed up on the ${freePlan.name} plan`, ip });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
    return json({ user: publicUser(user), plan: freePlan }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
