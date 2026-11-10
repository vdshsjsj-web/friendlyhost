'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'signup';

export default function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSignup ? { name, email, password } : { email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: { message?: string }[] | null;
      };
      if (!response.ok) {
        const fieldError = Array.isArray(data.details) ? data.details.find((item) => item?.message)?.message : null;
        throw new Error(fieldError || data.error || 'That did not work. Please try again.');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'That did not work. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {isSignup ? 'Create your Jasfer account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {isSignup
            ? 'You start on the free plan — create a Paper or Bedrock server straight away.'
            : 'Sign in to manage your servers, console and files.'}
        </p>
      </div>

      {googleEnabled && (
        <>
          <a href="/api/auth/google" className="btn-ghost w-full py-2.5">
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.3-1.66 3.8-5.5 3.8A6 6 0 0 1 12 6c1.7 0 2.9.72 3.55 1.34l2.42-2.33A9.6 9.6 0 0 0 12 2.4a9.6 9.6 0 1 0 0 19.2c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.11-.16-1.6H12Z"
              />
            </svg>
            Continue with Google
          </a>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {isSignup && (
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex"
              autoComplete="name"
              required
              minLength={2}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? 8 : 1}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        {isSignup ? (
          <>
            Already hosting with us?{' '}
            <Link href="/login" className="font-semibold text-jasfer-300 hover:text-jasfer-200">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/signup" className="font-semibold text-jasfer-300 hover:text-jasfer-200">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
