import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getDb, type PlanRow, type UserRow } from '@/lib/db';
import { createSession, setSessionCookie, normalizeEmail } from '@/lib/auth';
import { logActivity } from '@/lib/audit';
import { randomId } from '@/lib/crypto.mjs';

type GoogleProfile = { sub: string; email: string; name?: string; picture?: string; email_verified?: boolean };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const failure = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, config.appUrl), 302);

  if (!config.google.clientId || !config.google.clientSecret) return failure('google_not_configured');
  if (!code || !state) return failure('google_cancelled');

  const db = getDb();
  const stored = db.prepare('SELECT redirect_to FROM oauth_states WHERE state = ?').get(state) as
    | { redirect_to: string }
    | undefined;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  db.prepare("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')").run();
  if (!stored) return failure('google_state');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return failure('google_token');
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return failure('google_token');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) return failure('google_profile');
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.email) return failure('google_email');

    const email = normalizeEmail(profile.email);
    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(profile.sub, email) as
      | UserRow
      | undefined;

    if (user) {
      db.prepare(
        `UPDATE users SET google_id = ?, avatar_url = COALESCE(?, avatar_url), name = COALESCE(?, name),
         last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).run(profile.sub, profile.picture ?? null, profile.name ?? null, user.id);
      if (user.status !== 'active') return failure('suspended');
    } else {
      const freePlan = db
        .prepare('SELECT * FROM plans WHERE is_free = 1 AND active = 1 ORDER BY sort_order LIMIT 1')
        .get() as PlanRow | undefined;
      const userId = randomId('usr');
      db.prepare(
        `INSERT INTO users (id, email, name, google_id, avatar_url, role, status, plan_id, last_login_at)
         VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, datetime('now'))`
      ).run(userId, email, profile.name || email.split('@')[0], profile.sub, profile.picture ?? null, freePlan?.id ?? null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
      logActivity({ actorId: userId, userId, action: 'account.created', detail: 'Signed up with Google' });
    }

    const session = createSession(user.id, { userAgent: request.headers.get('user-agent') });
    await setSessionCookie(session.token, session.expires);
    logActivity({ actorId: user.id, userId: user.id, action: 'auth.login', detail: 'Signed in with Google' });

    return NextResponse.redirect(new URL(stored.redirect_to || '/dashboard', config.appUrl), 302);
  } catch (error) {
    console.error('[google-oauth]', error);
    return failure('google_failed');
  }
}
