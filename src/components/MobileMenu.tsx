'use client';

import { useState } from 'react';
import Link from 'next/link';

const links = [
  { href: '/#features', label: 'Features' },
  { href: '/#plans', label: 'Plans' },
  { href: '/#infrastructure', label: 'Infrastructure' },
  { href: '/#faq', label: 'FAQ' },
];

export default function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
      >
        <span className="relative block h-3.5 w-5">
          <span
            className={`absolute left-0 h-0.5 w-5 rounded bg-current transition-all duration-300 ${
              open ? 'top-1.5 rotate-45' : 'top-0'
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 h-0.5 w-5 rounded bg-current transition-all duration-200 ${
              open ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`absolute left-0 h-0.5 w-5 rounded bg-current transition-all duration-300 ${
              open ? 'top-1.5 -rotate-45' : 'top-3'
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-white/10 bg-void-950/97 px-4 pb-6 pt-3 backdrop-blur-xl">
          <nav className="flex flex-col">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
            {signedIn ? (
              <Link href="/dashboard" className="btn-primary w-full" onClick={() => setOpen(false)}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost w-full" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
                <Link href="/signup" className="btn-primary w-full" onClick={() => setOpen(false)}>
                  Create free account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
