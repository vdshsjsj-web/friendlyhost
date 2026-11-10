'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

const USER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Servers', icon: 'M4 7h16v10H4zM8 11h8', exact: true },
  { href: '/dashboard/activity', label: 'Activity', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { href: '/dashboard/plans', label: 'Plans & limits', icon: 'M4 6h16M4 12h16M4 18h10' },
];

export default function DashboardShell({
  user,
  planName,
  children,
}: {
  user: { name: string; email: string; role: string };
  planName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const nav = user.role === 'admin' ? [...USER_NAV, { href: '/admin', label: 'Admin', icon: 'M12 3l8 4v6c0 4-3.4 7.4-8 8-4.6-.6-8-4-8-8V7l8-4Z' }] : USER_NAV;

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/');
    router.refresh();
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
        <Link href="/dashboard" onClick={() => setOpen(false)} aria-label="Jasfer Hosting dashboard">
          <Logo size={30} />
        </Link>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-2.5 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Panel</p>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive(item)
                ? 'border border-jasfer-400/30 bg-jasfer-500/15 text-white'
                : 'border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d={item.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-jasfer-500 to-fuchsia-500 text-xs font-bold text-white">
              {initials || 'J'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.name}</p>
              <p className="truncate text-[11px] text-slate-500">{planName ?? 'No plan'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="btn-ghost btn-sm mt-3 w-full"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-void-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.06] bg-void-900/60 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-void-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/[0.08] bg-void-900 shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-void-950/80 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Jasfer Hosting</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
          {user.role === 'admin' && (
            <span className="chip border-jasfer-400/30 bg-jasfer-500/10 text-jasfer-200">Admin</span>
          )}
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
