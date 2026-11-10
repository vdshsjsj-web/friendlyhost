import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Activity' };

const LABELS: Record<string, string> = {
  'auth.signup': 'Account created',
  'auth.login': 'Signed in',
  'auth.google': 'Signed in with Google',
  'server.created': 'Server created',
  'server.start': 'Server started',
  'server.stop': 'Server stopped',
  'server.restart': 'Server restarted',
  'server.command': 'Command sent',
  'server.updated': 'Server settings updated',
  'server.deleted': 'Server deleted',
  'server.file.write': 'File saved',
  'server.file.upload': 'File uploaded',
  'server.file.delete': 'File deleted',
  'server.file.mkdir': 'Folder created',
  'server.file.rename': 'File renamed',
  'server.plugin.install': 'Plugin installed',
  'server.plugin.delete': 'Plugin removed',
};

type Row = { id: string; action: string; detail: string; created_at: string; server_name: string | null };

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/activity');

  const rows = getDb()
    .prepare(
      `SELECT a.id, a.action, a.detail, a.created_at, s.name AS server_name
       FROM activity a LEFT JOIN servers s ON s.id = a.server_id
       WHERE a.actor_id = ? OR s.owner_id = ?
       ORDER BY a.created_at DESC LIMIT 100`
    )
    .all(user.id, user.id) as Row[];

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Audit trail</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Activity</h1>
        <p className="mt-1.5 text-sm muted">Every control action, file change and plugin install is recorded here.</p>
      </header>

      <div className="card animate-fade-up delay-1 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-sm muted">No activity recorded yet. Create a server to get started.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="chip shrink-0">{LABELS[row.action] ?? row.action}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {row.server_name ? <span className="text-white">{row.server_name}</span> : null}
                  {row.detail ? <span className="muted"> · {row.detail}</span> : null}
                </span>
                <time className="shrink-0 text-xs muted">{new Date(`${row.created_at}Z`).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/dashboard" className="btn btn-ghost btn-sm">
        Back to servers
      </Link>
    </div>
  );
}
