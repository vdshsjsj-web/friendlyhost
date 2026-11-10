'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicServer } from './ServerWorkspace';

export default function ServerSettings({
  server,
  activity,
  isOwner,
  onSaved,
}: {
  server: PublicServer;
  activity: { action: string; detail: string | null; at: string }[];
  isOwner: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [name, setName] = useState(server.name);
  const [motd, setMotd] = useState(server.motd);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function patch(payload: Record<string, unknown>, label: string) {
    setSaving(label);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/servers/${server.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not save those settings.');
      setNotice(`${label} saved.`);
      await onSaved();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Could not save those settings.');
    } finally {
      setSaving(null);
    }
  }

  async function removeServer() {
    if (confirmName !== server.name) {
      setError('Type the exact server name to confirm deletion.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${server.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not delete this server.');
      router.push('/dashboard');
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this server.');
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-white">Server identity</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void patch({ name }, 'Server name');
          }}
        >
          <div>
            <label className="label" htmlFor="rename">
              Display name
            </label>
            <input
              id="rename"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={3}
              maxLength={40}
              required
            />
          </div>
          <button type="submit" className="btn-primary btn-sm" disabled={saving !== null || name === server.name}>
            {saving === 'Server name' ? 'Saving…' : 'Save name'}
          </button>
        </form>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void patch({ motd }, 'MOTD');
          }}
        >
          <div>
            <label className="label" htmlFor="motd">
              MOTD
            </label>
            <input
              id="motd"
              className="input"
              value={motd}
              onChange={(event) => setMotd(event.target.value)}
              maxLength={120}
              placeholder="A Jasfer Hosting server"
            />
            <p className="mt-1 text-[11px] text-slate-500">Shown in the Minecraft multiplayer list. Max 120 characters.</p>
          </div>
          <button type="submit" className="btn-primary btn-sm" disabled={saving !== null || motd === server.motd}>
            {saving === 'MOTD' ? 'Saving…' : 'Save MOTD'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-[11px] text-rose-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-[11px] text-emerald-200">
            {notice}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-white">Node & resources</h2>
        <dl className="mt-3 space-y-2 text-xs">
          {[
            { k: 'Server ID', v: server.id },
            { k: 'Software', v: server.edition === 'bedrock' ? 'Bedrock Dedicated Server' : `${server.software} ${server.version}` },
            { k: 'Node', v: server.node ? `${server.node.name} · ${server.node.provider}` : 'Not attached' },
            { k: 'Location', v: server.node?.location ?? '—' },
            { k: 'Plan', v: server.plan ? `${server.plan.name} (${server.plan.ramMb} MB / ${server.plan.storageMb} MB)` : '—' },
            { k: 'Address', v: server.ip && server.port ? `${server.ip}:${server.port}` : 'Pending allocation' },
            { k: 'Created', v: new Date(server.createdAt).toLocaleString() },
            { k: 'Last status', v: server.lastStatusAt ? new Date(server.lastStatusAt).toLocaleString() : '—' },
          ].map((row) => (
            <div key={row.k} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0">
              <dt className="text-slate-500">{row.k}</dt>
              <dd className="max-w-[60%] break-words text-right font-medium text-slate-200">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-white">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activity.map((item, index) => (
              <li key={`${item.at}-${index}`} className="flex items-start justify-between gap-3 text-[11px]">
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] text-jasfer-300">{item.action}</span>
                  <span className="block truncate text-slate-400">{item.detail ?? '—'}</span>
                </span>
                <span className="shrink-0 text-slate-600">{new Date(item.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card border-rose-500/25 p-4">
        <h2 className="text-sm font-semibold text-rose-200">Danger zone</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Deleting removes the server from the node, including its world and files. This cannot be undone.
        </p>
        {isOwner ? (
          <div className="mt-3 space-y-2">
            <input
              className="input text-xs"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={`Type "${server.name}" to confirm`}
              aria-label="Confirm server name"
            />
            <button
              type="button"
              className="btn-danger btn-sm w-full"
              onClick={() => void removeServer()}
              disabled={deleting || confirmName !== server.name}
            >
              {deleting ? 'Deleting…' : 'Delete this server'}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-slate-500">Only the owner can delete this server.</p>
        )}
      </section>
    </div>
  );
}
