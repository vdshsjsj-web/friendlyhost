'use client';

import { useCallback, useEffect, useState } from 'react';

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  ram_mb: number;
  cpu_percent: number;
  storage_mb: number;
  max_servers: number;
  is_free: number;
  features: string[];
  sort_order: number;
  active: number;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  priceCents: string;
  ramMb: string;
  cpuPercent: string;
  storageMb: string;
  maxServers: string;
  isFree: boolean;
  features: string;
  sortOrder: string;
  active: boolean;
};

const EMPTY: FormState = {
  name: '',
  slug: '',
  description: '',
  priceCents: '0',
  ramMb: '2048',
  cpuPercent: '100',
  storageMb: '10240',
  maxServers: '1',
  isFree: false,
  features: '',
  sortOrder: '0',
  active: true,
};

function toForm(plan: Plan): FormState {
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? '',
    priceCents: String(plan.price_cents),
    ramMb: String(plan.ram_mb),
    cpuPercent: String(plan.cpu_percent),
    storageMb: String(plan.storage_mb),
    maxServers: String(plan.max_servers),
    isFree: Boolean(plan.is_free),
    features: (plan.features ?? []).join('\n'),
    sortOrder: String(plan.sort_order),
    active: Boolean(plan.active),
  };
}

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/plans');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load plans');
      setPlans(data.plans ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load plans');
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

  function payload() {
    return {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      priceCents: Number(form.priceCents) || 0,
      ramMb: Number(form.ramMb) || 0,
      cpuPercent: Number(form.cpuPercent) || 100,
      storageMb: Number(form.storageMb) || 0,
      maxServers: Number(form.maxServers) || 1,
      isFree: form.isFree,
      features: form.features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      sortOrder: Number(form.sortOrder) || 0,
      active: form.active,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/plans', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload() } : payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setNotice(editingId ? `Plan "${form.name}" updated` : `Plan "${form.name}" created`);
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Delete plan "${plan.name}"? Plans in use are archived instead.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/plans?id=${encodeURIComponent(plan.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setNotice(data.message ?? `Plan "${plan.name}" deleted`);
      if (editingId === plan.id) {
        setEditingId(null);
        setForm(EMPTY);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p> : null}

        {loading ? <p className="text-sm muted">Loading plans…</p> : null}
        {!loading && plans.length === 0 ? <div className="card p-6 text-sm muted">No plans yet — create one on the right.</div> : null}

        {plans.map((plan) => (
          <div key={plan.id} className={`card p-4 ${plan.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{plan.name}</h3>
              <span className="chip">{plan.slug}</span>
              <span className="chip">{plan.is_free ? 'free' : `$${(plan.price_cents / 100).toFixed(2)}`}</span>
              {!plan.active ? <span className="chip">archived</span> : null}
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingId(plan.id);
                    setForm(toForm(plan));
                    setNotice(null);
                  }}
                >
                  Edit
                </button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove(plan)}>
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm muted">{plan.description || 'No description'}</p>
            <p className="mt-2 text-xs muted">
              {(plan.ram_mb / 1024).toFixed(1)} GB RAM · {plan.cpu_percent}% CPU · {(plan.storage_mb / 1024).toFixed(1)} GB disk ·{' '}
              {plan.max_servers} server(s)
            </p>
            {plan.features.length ? <p className="mt-1 text-xs muted">{plan.features.join(' · ')}</p> : null}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="card h-fit space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{editingId ? 'Edit plan' : 'New plan'}</h2>
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
          <label className="label" htmlFor="plan-name">Name</label>
          <input id="plan-name" className="input" required minLength={2} value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="plan-slug">Slug</label>
          <input
            id="plan-slug"
            className="input"
            required
            pattern="[a-z0-9-]+"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value.toLowerCase())}
          />
        </div>
        <div>
          <label className="label" htmlFor="plan-desc">Description</label>
          <input id="plan-desc" className="input" maxLength={200} value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="plan-ram">RAM (MB)</label>
            <input id="plan-ram" type="number" min={256} className="input" value={form.ramMb} onChange={(e) => update('ramMb', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="plan-disk">Storage (MB)</label>
            <input id="plan-disk" type="number" min={512} className="input" value={form.storageMb} onChange={(e) => update('storageMb', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="plan-cpu">CPU (%)</label>
            <input id="plan-cpu" type="number" min={10} className="input" value={form.cpuPercent} onChange={(e) => update('cpuPercent', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="plan-servers">Max servers</label>
            <input id="plan-servers" type="number" min={1} className="input" value={form.maxServers} onChange={(e) => update('maxServers', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="plan-price">Price (cents)</label>
            <input id="plan-price" type="number" min={0} className="input" value={form.priceCents} onChange={(e) => update('priceCents', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="plan-sort">Sort order</label>
            <input id="plan-sort" type="number" min={0} className="input" value={form.sortOrder} onChange={(e) => update('sortOrder', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="plan-features">Features (one per line)</label>
          <textarea id="plan-features" rows={3} className="input" value={form.features} onChange={(e) => update('features', e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isFree} onChange={(e) => update('isFree', e.target.checked)} /> Free plan
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} /> Active
        </label>

        <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Saving…' : editingId ? 'Save plan' : 'Create plan'}
        </button>
      </form>
    </div>
  );
}
