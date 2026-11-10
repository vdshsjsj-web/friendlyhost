import Link from 'next/link';
import Logo from './Logo';
import MobileMenu from './MobileMenu';
import { getCurrentUser } from '@/lib/auth';

const links = [
  { href: '/#features', label: 'Features' },
  { href: '/#plans', label: 'Plans' },
  { href: '/#infrastructure', label: 'Infrastructure' },
  { href: '/#faq', label: 'FAQ' },
];

export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-void-950/80 backdrop-blur-xl">
      <div className="container-page relative flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" aria-label="Jasfer Hosting home">
          <Logo size={34} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          {user ? (
            <>
              <Link href="/dashboard" className="btn-ghost">
                Dashboard
              </Link>
              <Link href="/servers" className="btn-primary">
                My servers
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Get started free
              </Link>
            </>
          )}
        </div>

        <MobileMenu signedIn={Boolean(user)} />
      </div>
    </header>
  );
}
