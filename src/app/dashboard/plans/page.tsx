import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb, type PlanRow } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Plans & limits' };

function gb(mb: number) {
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
}

export default async function PlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/plans');

  const db = getDb();
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC').all() as PlanRow[];
  const current = user.plan_id ? plans.find((p) => p.id === user.plan_id) ?? null : null;
  const usage = db
    .prepare('SELECT COUNT(*) AS servers, COALESCE(SUM(ram_mb),0) AS ram, COALESCE(SUM(storage_mb),0) AS storage FROM servers WHERE owner_id = ?')
    .get(user.id) as { servers: number; ram: number; storage: number };

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Resource limits</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Plans &amp; limits</h1>
        <p className="mt-1.5 text-sm muted">
          Your plan decides how much RAM, CPU and disk each new server may request. Limits are enforced by the API, not by the UI.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card animate-fade-up p-5">
          <p className="text-xs uppercase tracking-wider muted">Current plan</p>
          <p className="mt-2 text-xl font-bold text-white">{current?.name ?? 'No plan assigned'}</p>
          <p className="mt-1 text-xs muted">
            {current ? `${current.max_servers} server${current.max_servers === 1 ? '' : 's'} allowed` : 'Ask an admin to assign a plan'}
          </p>
        </div>
        <div className="card animate-fade-up delay-1 p-5">
          <p className="text-xs uppercase tracking-wider muted">Servers used</p>
          <p className="mt-2 text-xl font-bold text-white">
            {usage.servers}
            <span className="text-sm font-normal muted"> / {current?.max_servers ?? '—'}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-jasfer-500 to-fuchsia-500"
              style={{ width: `${current ? Math.min(100, (usage.servers / current.max_servers) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className="card animate-fade-up delay-2 p-5">
          <p className="text-xs uppercase tracking-wider muted">Allocated RAM</p>
          <p className="mt-2 text-xl font-bold text-white">{gb(usage.ram)}</p>
          <p className="mt-1 text-xs muted">{gb(usage.storage)} storage allocated</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan, index) => {
          const active = plan.id === user.plan_id;
          const features = JSON.parse(plan.features || '[]') as string[];
          return (
            <div
              key={plan.id}
              className={`card relative flex flex-col p-6 animate-fade-up ${active ? 'ring-1 ring-jasfer-500/60' : ''}`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {active ? (
                <span className="absolute right-4 top-4 rounded-full bg-jasfer-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-jasfer-200">
                  Active
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
              <p className="mt-1 text-sm muted">{plan.description}</p>
              <p className="mt-4 text-2xl font-bold text-white">
                {plan.is_free ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)}`}
                {!plan.is_free ? <span className="text-sm font-normal muted"> /mo</span> : null}
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                <li>{gb(plan.ram_mb)} RAM</li>
                <li>{plan.cpu_percent}% CPU</li>
                <li>{gb(plan.storage_mb)} storage</li>
                <li>{plan.max_servers} server{plan.max_servers === 1 ? '' : 's'}</li>
                {features.map((feature) => (
                  <li key={feature} className="muted">
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex-1" />
              {active ? (
                <span className="btn btn-ghost btn-sm w-full justify-center opacity-70">Current plan</span>
              ) : (
                <Link href="/dashboard" className="btn btn-primary btn-sm w-full justify-center">
                  Create a server
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs muted">
        Plan changes are handled by an administrator from the admin dashboard — no payment provider is required for this
        self-hosted install, so nothing is charged automatically.
      </p>
    </div>
  );
}
