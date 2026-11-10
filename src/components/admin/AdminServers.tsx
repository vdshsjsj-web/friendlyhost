'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Server = {
  id: string;
  name: string;
  owner_email: string | null;
  node_name: string | null;
  node_provider: string | null;
  plan_name: string | null;
  software: string;
  version: string;
  edition: string;
  status: string;
  ram_mb: number;
  storage_mb: number;
  ip: string | null;
  port: number | null;
  created_at: string;
};

const ACTIONS = [
  { action: 'start', label: 'Start' },
  { action: 'stop', label: 'Stop' },
  { action: 'restart', label: 'Restart' },
] as const;

export default function AdminServers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/servers');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load servers');
      setServers(data.servers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(server: Server, action: string) {
    if (action === 'delete' && !window.confirm(`Delete "${server.name}" and stop its process?`)) return;
    setBusy(server.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/servers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      setNotice(`${server.name}: ${action} ok`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  const filtered = servers.filter((server) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      server.name.toLowerCase().includes(needle) ||
      (server.owner_email ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search server or owner"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="text-xs muted">{filtered.length} server(s)</span>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p> : null}

      {loading ? (
        <p className="text-sm muted">Loading servers…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-sm muted">No servers yet.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((server) => (
            <div key={server.id} className={`card p-4 ${busy === server.id ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/servers/${server.id}`} className="font-semibold text-white hover:text-jasfer-300">
                  {server.name}
                </Link>
                <span className="chip">{server.software} {server.version}</span>
                <span className="chip">{server.edition}</span>
                <span className="chip">{server.status}</span>
                {server.node_name ? <span className="chip">{server.node_name} · {server.node_provider}</span> : <span className="chip">no node</span>}
                <span className="ml-auto text-xs muted">{server.owner_email ?? 'unknown owner'}</span>
              </div>

              <p className="mt-2 text-xs muted">
                {server.ip ? `${server.ip}:${server.port}` : 'no address yet'} · {Math.round(server.ram_mb / 1024 * 10) / 10} GB RAM ·{' '}
                {server.plan_name ?? 'no plan'} · created {new Date(`${server.created_at}Z`).toLocaleDateString()}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {ACTIONS.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy === server.id || server.status === 'suspended'}
                    onClick={() => void act(server, item.action)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === server.id}
                  onClick={() => void act(server, server.status === 'suspended' ? 'activate' : 'suspend')}
                >
                  {server.status === 'suspended' ? 'Activate' : 'Suspend'}
                </button>
                <button type="button" className="btn btn-danger btn-sm ml-auto" disabled={busy === server.id} onClick={() => void act(server, 'delete')}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
