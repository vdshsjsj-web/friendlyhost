'use client';

import { useCallback, useEffect, useState } from 'react';

type Node = {
  id: string;
  name: string;
  provider: 'local' | 'pterodactyl';
  location: string;
  apiUrl: string | null;
  hasApiKey: boolean;
  hasClientKey: boolean;
  pterodactylNodeId: number | null;
  nestId: number | null;
  eggId: number | null;
  capacityRamMb: number;
  capacityStorageMb: number;
  active: boolean;
  status: string;
  statusMessage: string | null;
  lastCheckedAt: string | null;
};

type Usage = { node_id: string; servers: number; ram_used: number; storage_used: number };

type FormState = {
  name: string;
  provider: 'local' | 'pterodactyl';
  location: string;
  apiUrl: string;
  apiKey: string;
  clientKey: string;
  pterodactylNodeId: string;
  nestId: string;
  eggId: string;
  capacityRamMb: string;
  capacityStorageMb: string;
  active: boolean;
};

const EMPTY: FormState = {
  name: '',
  provider: 'local',
  location: 'auto',
  apiUrl: '',
  apiKey: '',
  clientKey: '',
  pterodactylNodeId: '1',
  nestId: '1',
  eggId: '',
  capacityRamMb: '0',
  capacityStorageMb: '0',
  active: true,
};

function gb(mb: number) {
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
}

export default function NodeManager() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/nodes');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load nodes');
      setNodes(data.nodes ?? []);
      setUsage(data.usage ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load nodes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function edit(node: Node) {
    setEditingId(node.id);
    setNotice(null);
    setForm({
      name: node.name,
      provider: node.provider,
      location: node.location,
      apiUrl: node.apiUrl ?? '',
      apiKey: '',
      clientKey: '',
      pterodactylNodeId: String(node.pterodactylNodeId ?? 1),
      nestId: String(node.nestId ?? 1),
      eggId: node.eggId ? String(node.eggId) : '',
      capacityRamMb: String(node.capacityRamMb ?? 0),
      capacityStorageMb: String(node.capacityStorageMb ?? 0),
      active: node.active,
    });
  }

  function payload() {
    const base: Record<string, unknown> = {
      name: form.name.trim(),
      provider: form.provider,
      location: form.location.trim() || 'auto',
      capacityRamMb: Number(form.capacityRamMb) || 0,
      capacityStorageMb: Number(form.capacityStorageMb) || 0,
      active: form.active,
    };
    if (form.provider === 'pterodactyl') {
      base.apiUrl = form.apiUrl.trim();
      base.pterodactylNodeId = Number(form.pterodactylNodeId) || 1;
      base.nestId = Number(form.nestId) || 1;
      if (form.eggId.trim()) base.eggId = Number(form.eggId);
      // Blank keys keep the stored encrypted values untouched.
      if (form.apiKey.trim()) base.apiKey = form.apiKey.trim();
      if (form.clientKey.trim()) base.clientKey = form.clientKey.trim();
    }
    return base;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy('form');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/nodes', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload() } : payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setNotice(editingId ? 'Node updated' : `Node "${form.name}" created`);
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function test(node: Node) {
    setBusy(node.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/nodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: node.id, action: 'test' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Connection test failed');
      setNotice(data.message ?? `${node.name}: connection OK`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove(node: Node) {
    if (!window.confirm(`Delete node "${node.name}"?`)) return;
    setBusy(node.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/nodes?id=${encodeURIComponent(node.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setNotice(`Node "${node.name}" deleted`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p> : null}

        {loading ? <p className="text-sm muted">Loading nodes…</p> : null}
        {!loading && nodes.length === 0 ? (
          <div className="card p-6 text-sm muted">
            No nodes configured. A <span className="text-white">local</span> node runs servers on this machine using the
            installed Java runtime; a <span className="text-white">pterodactyl</span> node connects to your own panel over
            its Application API.
          </div>
        ) : null}

        {nodes.map((node) => {
          const use = usage.find((row) => row.node_id === node.id);
          return (
            <div key={node.id} className={`card p-4 ${node.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-white">{node.name}</h3>
                <span className="chip">{node.provider}</span>
                <span className="chip">{node.location}</span>
                <span className={`chip ${node.status === 'online' ? 'border-emerald-400/30 text-emerald-300' : ''}`}>{node.status}</span>
                {!node.active ? <span className="chip">inactive</span> : null}
                <div className="ml-auto flex gap-1.5">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy === node.id} onClick={() => void test(node)}>
                    {busy === node.id ? 'Testing…' : 'Test'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(node)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy === node.id} onClick={() => void remove(node)}>
                    Delete
                  </button>
                </div>
              </div>

              <p className="mt-1 text-sm muted">
                {node.provider === 'pterodactyl'
                  ? `${node.apiUrl ?? 'no panel URL'} · API key ${node.hasApiKey ? 'stored' : 'missing'} · client key ${node.hasClientKey ? 'stored' : 'missing'} · egg ${node.eggId ?? 'auto'}`
                  : 'Runs the real Java server process on this host'}
              </p>
              <p className="mt-1 text-xs muted">
                {use ? `${use.servers} server(s) · ${gb(use.ram_used)} RAM used` : 'no servers'} · capacity{' '}
                {node.capacityRamMb ? gb(node.capacityRamMb) : 'unlimited'}
                {node.statusMessage ? ` · ${node.statusMessage}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="card h-fit space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{editingId ? 'Edit node' : 'New node'}</h2>
          {editingId ? (
            <button
              type="button"
              className="text-xs text-jasfer-300 hover:underline"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="node-name">Name</label>
          <input id="node-name" className="input" required minLength={2} value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="node-provider">Provider</label>
          <select
            id="node-provider"
            className="input"
            value={form.provider}
            disabled={Boolean(editingId)}
            onChange={(e) => update('provider', e.target.value as FormState['provider'])}
          >
            <option value="local">Local Java runtime</option>
            <option value="pterodactyl">Pterodactyl panel</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="node-location">Location label</label>
          <input id="node-location" className="input" value={form.location} onChange={(e) => update('location', e.target.value)} />
        </div>

        {form.provider === 'pterodactyl' ? (
          <>
            <div>
              <label className="label" htmlFor="node-url">Panel URL</label>
              <input
                id="node-url"
                className="input"
                type="url"
                placeholder="https://panel.example.com"
                value={form.apiUrl}
                onChange={(e) => update('apiUrl', e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="node-api-key">Application API key</label>
              <input
                id="node-api-key"
                className="input"
                type="password"
                autoComplete="off"
                placeholder={editingId ? 'Leave blank to keep stored key' : 'ptla_…'}
                value={form.apiKey}
                onChange={(e) => update('apiKey', e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="node-client-key">Client API key</label>
              <input
                id="node-client-key"
                className="input"
                type="password"
                autoComplete="off"
                placeholder={editingId ? 'Leave blank to keep stored key' : 'ptlc_…'}
                value={form.clientKey}
                onChange={(e) => update('clientKey', e.target.value)}
              />
              <p className="mt-1 text-[11px] muted">Keys are encrypted with JASFER_ENCRYPTION_KEY and never returned to the browser.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label" htmlFor="node-ptero-id">Node ID</label>
                <input id="node-ptero-id" type="number" min={1} className="input" value={form.pterodactylNodeId} onChange={(e) => update('pterodactylNodeId', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="node-nest">Nest</label>
                <input id="node-nest" type="number" min={1} className="input" value={form.nestId} onChange={(e) => update('nestId', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="node-egg">Egg</label>
                <input id="node-egg" type="number" min={1} className="input" placeholder="auto" value={form.eggId} onChange={(e) => update('eggId', e.target.value)} />
              </div>
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="node-ram">Capacity RAM (MB)</label>
            <input id="node-ram" type="number" min={0} className="input" value={form.capacityRamMb} onChange={(e) => update('capacityRamMb', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="node-disk">Capacity disk (MB)</label>
            <input id="node-disk" type="number" min={0} className="input" value={form.capacityStorageMb} onChange={(e) => update('capacityStorageMb', e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} /> Active (accepts new servers)
        </label>

        <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy === 'form'}>
          {busy === 'form' ? 'Saving…' : editingId ? 'Save node' : 'Add node'}
        </button>
      </form>
    </div>
  );
}
