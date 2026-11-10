import Link from 'next/link';
import { getDb } from '@/lib/db';
import { platformStatus } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Admin overview' };

function gb(mb: number) {
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
}

export default async function AdminOverviewPage() {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspended_users,
         (SELECT COUNT(*) FROM servers) AS servers,
         (SELECT COUNT(*) FROM servers WHERE status = 'running') AS running,
         (SELECT COUNT(*) FROM servers WHERE status = 'suspended') AS suspended_servers,
         (SELECT COUNT(*) FROM plans WHERE active = 1) AS plans,
         (SELECT COUNT(*) FROM nodes WHERE active = 1) AS nodes,
         (SELECT COALESCE(SUM(ram_mb),0) FROM servers) AS ram_allocated`
    )
    .get() as {
    users: number;
    suspended_users: number;
    servers: number;
    running: number;
    suspended_servers: number;
    plans: number;
    nodes: number;
    ram_allocated: number;
  };

  const platform = await platformStatus().catch(() => null);

  const recentServers = db
    .prepare(
      `SELECT s.id, s.name, s.software, s.version, s.status, s.created_at, u.email AS owner_email
       FROM servers s LEFT JOIN users u ON u.id = s.owner_id
       ORDER BY s.created_at DESC LIMIT 8`
    )
    .all() as { id: string; name: string; software: string; version: string; status: string; created_at: string; owner_email: string | null }[];

  const activity = db
    .prepare(
      `SELECT a.action, a.detail, a.created_at, u.email AS actor_email
       FROM activity a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT 10`
    )
    .all() as { action: string; detail: string; created_at: string; actor_email: string | null }[];

  const stats = [
    { label: 'Users', value: counts.users, note: `${counts.suspended_users} suspended` },
    { label: 'Servers', value: counts.servers, note: `${counts.running} running` },
    { label: 'Plans', value: counts.plans, note: 'active' },
    { label: 'Nodes', value: counts.nodes, note: 'active' },
  ];

  return (
    <div className="space-y-6">
      <header className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Administration</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Platform overview</h1>
          <p className="mt-1.5 text-sm muted">Users, servers, nodes and infrastructure state at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/plans" className="btn btn-ghost btn-sm">Plans</Link>
          <Link href="/admin/nodes" className="btn btn-primary btn-sm">Nodes</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div key={stat.label} className="card animate-fade-up p-4 sm:p-5" style={{ animationDelay: `${index * 50}ms` }}>
            <p className="text-xs uppercase tracking-wider muted">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
            <p className="mt-0.5 text-xs muted">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card animate-fade-up p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Infrastructure</h2>
            <span className={`chip ${platform?.connected ? 'border-emerald-400/30 text-emerald-300' : ''}`}>
              {platform?.connected ? 'Node connected' : 'No node connected'}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <dt className="text-xs muted">Local runtime</dt>
              <dd className="mt-1 text-sm text-white">
                {platform?.local.enabled ? (platform.local.java.available ? platform.local.java.version : 'Java not found') : 'Disabled'}
              </dd>
              <dd className="mt-0.5 text-xs muted">
                {platform?.local.capacity
                  ? `${gb(platform.local.capacity.totalMb)} total · ${gb(platform.local.capacity.availableMb)} free`
                  : 'Capacity unavailable'}
              </dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <dt className="text-xs muted">Pterodactyl</dt>
              <dd className="mt-1 text-sm text-white">
                {platform ? `${platform.pterodactyl.configured} of ${platform.pterodactyl.nodes} configured` : 'Unknown'}
              </dd>
              <dd className="mt-0.5 text-xs muted">API keys stay server-side and encrypted</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <dt className="text-xs muted">Allocated RAM</dt>
              <dd className="mt-1 text-sm text-white">{gb(counts.ram_allocated)}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <dt className="text-xs muted">Suspended servers</dt>
              <dd className="mt-1 text-sm text-white">{counts.suspended_servers}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2">
            {platform?.nodes.length ? (
              platform.nodes.map((node) => (
                <div key={node.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                  <span className="font-medium text-white">{node.name}</span>
                  <span className="chip">{node.provider}</span>
                  <span className="text-xs muted">{node.location}</span>
                  <span className="ml-auto text-xs muted">
                    {node.configured ? (node.active ? 'active' : 'inactive') : 'not configured'} · {node.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm muted">
                No nodes yet. Add a local node to run servers on this machine, or connect a Pterodactyl panel in{' '}
                <Link href="/admin/nodes" className="text-jasfer-300 underline">Nodes</Link>.
              </p>
            )}
          </div>
        </div>

        <div className="card animate-fade-up p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Recent activity</h2>
          <ul className="mt-3 space-y-2.5">
            {activity.length === 0 ? <li className="text-sm muted">Nothing yet.</li> : null}
            {activity.map((row, index) => (
              <li key={`${row.action}-${index}`} className="text-sm">
                <p className="text-slate-200">{row.action}</p>
                <p className="text-xs muted">
                  {row.actor_email ?? 'system'} · {new Date(`${row.created_at}Z`).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Newest servers</h2>
          <Link href="/admin/servers" className="text-xs text-jasfer-300 hover:underline">Manage all</Link>
        </div>
        {recentServers.length === 0 ? (
          <p className="p-5 text-sm muted">No servers created yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {recentServers.map((server) => (
              <li key={server.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <span className="font-medium text-white">{server.name}</span>
                <span className="chip">{server.software} {server.version}</span>
                <span className="chip">{server.status}</span>
                <span className="ml-auto text-xs muted">{server.owner_email ?? 'unknown owner'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
