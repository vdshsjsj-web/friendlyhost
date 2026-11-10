'use client';

import { useCallback, useEffect, useState } from 'react';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  plan_id: string | null;
  plan_name: string | null;
  created_at: string;
  last_login_at: string | null;
  server_count: number;
};

type Plan = { id: string; name: string };

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, plansRes] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/plans')]);
      const usersBody = await usersRes.json().catch(() => ({}));
      const plansBody = await plansRes.json().catch(() => ({}));
      if (!usersRes.ok) throw new Error(usersBody.error ?? 'Could not load users');
      setUsers(usersBody.users ?? []);
      setPlans((plansBody.plans ?? []).map((plan: Plan) => ({ id: plan.id, name: plan.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(userId: string, body: Record<string, unknown>, label: string) {
    setBusy(userId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setNotice(label);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove(user: User) {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setBusy(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setNotice(`Deleted ${user.email}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(user: User) {
    const password = window.prompt(`New password for ${user.email} (min 8 characters)`);
    if (!password) return;
    await patch(user.id, { password }, `Password reset for ${user.email}`);
  }

  const filtered = users.filter((user) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return user.email.toLowerCase().includes(needle) || user.name.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by email or name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="text-xs muted">{filtered.length} account(s)</span>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p> : null}

      {loading ? (
        <p className="text-sm muted">Loading accounts…</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-white/[0.06] text-xs uppercase tracking-wider muted">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Servers</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((user) => (
                <tr key={user.id} className={busy === user.id ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{user.name}</p>
                    <p className="text-xs muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input h-8 py-0 text-xs"
                      value={user.role}
                      disabled={busy === user.id}
                      onChange={(event) => void patch(user.id, { role: event.target.value }, `${user.email} role updated`)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${user.status === 'active' ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/30 text-amber-200'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input h-8 py-0 text-xs"
                      value={user.plan_id ?? ''}
                      disabled={busy === user.id}
                      onChange={(event) => void patch(user.id, { planId: event.target.value || null }, `${user.email} plan updated`)}
                    >
                      <option value="">No plan</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">{user.server_count}</td>
                  <td className="px-4 py-3 text-xs muted">{new Date(`${user.created_at}Z`).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy === user.id}
                        onClick={() =>
                          void patch(
                            user.id,
                            { status: user.status === 'active' ? 'suspended' : 'active' },
                            `${user.email} ${user.status === 'active' ? 'suspended' : 'reactivated'}`
                          )
                        }
                      >
                        {user.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === user.id} onClick={() => void resetPassword(user)}>
                        Password
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" disabled={busy === user.id} onClick={() => void remove(user)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm muted">
                    No accounts match this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
