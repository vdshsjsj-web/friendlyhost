'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusPill from '@/components/server/StatusPill';

export type DashboardServer = {
  id: string;
  name: string;
  software: string;
  version: string;
  edition: string;
  status: string;
  statusMessage: string | null;
  ip: string | null;
  port: number | null;
  motd: string;
  ramMb: number;
  cpuPercent: number;
  storageMb: number;
  planName: string | null;
  nodeName: string | null;
  nodeProvider: string | null;
};

function gb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

export default function ServerCard({ server }: { server: DashboardServer }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const address = server.ip && server.port ? `${server.ip}:${server.port}` : 'Pending allocation';
  const suspended = server.status === 'suspended';

  async function power(action: 'start' | 'stop' | 'restart') {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${server.id}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Could not ${action} the server.`);
      router.refresh();
    } catch (powerError) {
      setError(powerError instanceof Error ? powerError.message : `Could not ${action} the server.`);
    } finally {
      setBusy(null);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed — select the address manually.');
    }
  }

  return (
    <article className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-white">{server.name}</h2>
            <StatusPill status={server.status} />
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {server.edition === 'bedrock' ? 'Bedrock' : server.software} {server.version} ·{' '}
            {server.nodeName ?? 'no node'} ({server.nodeProvider ?? '—'}) · {server.planName ?? 'no plan'}
          </p>
        </div>
        <Link href={`/dashboard/servers/${server.id}`} className="btn-ghost btn-sm shrink-0">
          Manage
        </Link>
      </div>

      <button
        type="button"
        onClick={copyAddress}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-void-950/50 px-3.5 py-2.5 text-left transition hover:border-jasfer-400/30"
      >
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Server address</span>
          <span className="block truncate font-mono text-sm text-slate-200">{address}</span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-jasfer-300">{copied ? 'Copied' : 'Copy'}</span>
      </button>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { k: 'RAM', v: gb(server.ramMb) },
          { k: 'CPU', v: `${server.cpuPercent}%` },
          { k: 'Disk', v: gb(server.storageMb) },
        ].map((item) => (
          <div key={item.k} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
            <dt className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{item.k}</dt>
            <dd className="text-xs font-semibold text-white">{item.v}</dd>
          </div>
        ))}
      </dl>

      {server.statusMessage && (
        <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{server.statusMessage}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="btn-primary btn-sm flex-1"
          onClick={() => power('start')}
          disabled={Boolean(busy) || suspended || server.status === 'running' || server.status === 'starting'}
        >
          {busy === 'start' ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm flex-1"
          onClick={() => power('restart')}
          disabled={Boolean(busy) || suspended || server.status === 'offline' || server.status === 'provisioning'}
        >
          {busy === 'restart' ? 'Restarting…' : 'Restart'}
        </button>
        <button
          type="button"
          className="btn-danger btn-sm flex-1"
          onClick={() => power('stop')}
          disabled={Boolean(busy) || suspended || server.status === 'offline' || server.status === 'provisioning'}
        >
          {busy === 'stop' ? 'Stopping…' : 'Stop'}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </article>
  );
}
