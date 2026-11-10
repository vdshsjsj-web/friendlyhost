import AdminServers from '@/components/admin/AdminServers';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Servers' };

export default function AdminServersPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Administration</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Servers</h1>
        <p className="mt-1.5 text-sm muted">Control every server, suspend abuse and remove instances across all nodes.</p>
      </header>
      <AdminServers />
    </div>
  );
}
