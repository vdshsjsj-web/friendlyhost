import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getDb } from '@/lib/db';
import { randomToken } from '@/lib/crypto.mjs';

/**
 * Starts Google sign-in. If OAuth is not configured we say so honestly instead
 * of pretending the button works.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get('redirect') || '/dashboard';

  if (!config.google.clientId || !config.google.clientSecret) {
    return NextResponse.redirect(
      new URL('/login?error=google_not_configured', config.appUrl),
      302
    );
  }

  const state = randomToken(24);
  getDb()
    .prepare('INSERT INTO oauth_states (state, redirect_to) VALUES (?, ?)')
    .run(state, redirectTo.startsWith('/') ? redirectTo : '/dashboard');

  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', config.google.clientId);
  authorize.searchParams.set('redirect_uri', config.google.redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('access_type', 'online');
  authorize.searchParams.set('prompt', 'select_account');

  return NextResponse.redirect(authorize.toString(), 302);
}
