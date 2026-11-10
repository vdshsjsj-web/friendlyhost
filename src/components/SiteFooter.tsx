import Link from 'next/link';
import Logo from './Logo';

export default function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-white/[0.06] bg-void-900/40">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo size={38} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              An open-source Minecraft hosting panel: real Java servers, a live console, file manager and a
              Pterodactyl-compatible node adapter. No fake controls, no hidden API keys.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Licensed MIT · Built with Next.js, SQLite and the Java runtime on your own hardware.
            </p>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Platform</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/signup" className="text-slate-400 transition hover:text-white">
                  Create account
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-slate-400 transition hover:text-white">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-slate-400 transition hover:text-white">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/#plans" className="text-slate-400 transition hover:text-white">
                  Plans &amp; limits
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Setup</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/#infrastructure" className="text-slate-400 transition hover:text-white">
                  Node infrastructure
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-slate-400 transition hover:text-white">
                  How it works
                </Link>
              </li>
              <li>
                <a href="mailto:support@jasfer.host" className="text-slate-400 transition hover:text-white">
                  support@jasfer.host
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Jasfer Hosting. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Panel status is shown live in your dashboard, never simulated.
          </p>
        </div>
      </div>
    </footer>
  );
}
