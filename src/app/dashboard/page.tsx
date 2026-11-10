import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb, type PlanRow, type ServerRow } from '@/lib/db';
import { platformStatus } from '@/lib/providers';
import ServerCard from '@/components/dashboard/ServerCard';
import CreateServerForm from '@/components/dashboard/CreateServerForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your servers' };

type Row = ServerRow & {
  plan_name: string | null;
  plan_slug: string | null;
  node_name: string | null;
  node_provider: string | null;
};

function gb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const db = getDb();
  const plan = user.plan_id
    ? ((db.prepare('SELECT * FROM plans WHERE id = ?').get(user.plan_id) as PlanRow | undefined) ?? null)
    : null;

  const servers = db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug, n.name AS node_name, n.provider AS node_provider
       FROM servers s
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN nodes n ON n.id = s.node_id
       WHERE s.owner_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(user.id) as Row[];

  let nodeConnected = false;
  let javaVersion: string | null = null;
  try {
    const platform = await platformStatus();
    nodeConnected = Boolean(platform.connected);
    javaVersion = platform.local.java.available ? platform.local.java.version : null;
  } catch {
    nodeConnected = false;
  }

  const running = servers.filter((server) => server.status === 'running').length;
  const ramAllocated = servers
    .filter((server) => server.status !== 'error')
    .reduce((total, server) => total + server.ram_mb, 0);
  const maxServers = plan?.max_servers ?? 0;
  const canCreate = Boolean(plan) && servers.filter((server) => server.status !== 'error').length < maxServers;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Hey {user.name.split(' ')[0]}, your servers
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {servers.length === 0
              ? 'Nothing deployed yet — create your first Minecraft server below.'
              : `${servers.length} server${servers.length === 1 ? '' : 's'} · ${running} running`}
          </p>
        </div>
        <CreateServerForm
          plan={plan ? { id: plan.id, name: plan.name, ramMb: plan.ram_mb, storageMb: plan.storage_mb } : null}
          canCreate={canCreate}
          nodeConnected={nodeConnected}
          isAdmin={user.role === 'admin'}
        />
      </header>

      {!nodeConnected && (
        <div className="card border-amber-400/25 bg-amber-400/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-100">No hosting node is connected yet</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                Jasfer will not fake a running server. {javaVersion ? '' : 'Install a JDK on this host to use the local node, or '}
                attach a Pterodactyl-compatible panel in{' '}
                <Link href="/admin/nodes" className="font-semibold underline decoration-amber-300/40">
                  Admin → Nodes
                </Link>{' '}
                before creating a server.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Servers', value: `${servers.length} / ${maxServers || '∞'}`, hint: plan?.name ?? 'No plan' },
          { label: 'Running', value: String(running), hint: running > 0 ? 'Live now' : 'All stopped' },
          { label: 'RAM allocated', value: gb(ramAllocated), hint: `Plan gives ${plan ? gb(plan.ram_mb) : '—'} each` },
          { label: 'Disk / server', value: plan ? gb(plan.storage_mb) : '—', hint: plan ? `${plan.cpu_percent}% CPU` : 'Pick a plan' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
            <p className="mt-1.5 text-xl font-bold text-white">{stat.value}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{stat.hint}</p>
          </div>
        ))}
      </section>

      {servers.length === 0 ? (
        <section className="card relative overflow-hidden p-10 text-center">
          <div className="aurora opacity-40" aria-hidden />
          <div className="relative">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-jasfer-400/25 bg-jasfer-500/10 text-jasfer-300">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16v10H4zM8 12h8M12 8v8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="mt-4 text-lg font-semibold text-white">No servers yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Choose Paper, Purpur, Vanilla, Fabric, Forge or Bedrock, pick a version and Jasfer provisions it on a
              connected node.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={{
                id: server.id,
                name: server.name,
                software: server.software,
                version: server.version,
                edition: server.edition,
                status: server.status,
                statusMessage: server.status_message,
                ip: server.ip,
                port: server.port,
                motd: server.motd,
                ramMb: server.ram_mb,
                cpuPercent: server.cpu_percent,
                storageMb: server.storage_mb,
                planName: server.plan_name,
                nodeName: server.node_name,
                nodeProvider: server.node_provider,
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
