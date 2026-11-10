'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = { name: string; path: string; type: 'file' | 'dir' | string; size: number; modifiedAt: string | null };

function humanSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

function childPath(directory: string, name: string) {
  return `${directory === '/' ? '' : directory}/${name}`;
}

export default function FileManager({ serverId }: { serverId: string }) {
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ file: string; content: string; editable: boolean; saving: boolean } | null>(null);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/servers/${serverId}/files?path=${encodeURIComponent(target)}`, {
          cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as { entries?: Entry[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not list that folder.');
        setEntries(data.entries ?? []);
        setPath(target);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not list that folder.');
      } finally {
        setLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    void load('/');
  }, [load]);

  async function act(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'That file operation failed.');
      setRenaming(null);
      setCreating(null);
      await load(path);
      if (successMessage) setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'That file operation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(entry: Entry) {
    setError(null);
    try {
      const response = await fetch(
        `/api/servers/${serverId}/files/content?file=${encodeURIComponent(childPath(path, entry.name))}`,
        { cache: 'no-store' }
      );
      const data = (await response.json().catch(() => ({}))) as {
        content?: string;
        editable?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Could not open that file.');
      setEditor({
        file: childPath(path, entry.name),
        content: data.content ?? '',
        editable: data.editable !== false,
        saving: false,
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open that file.');
    }
  }

  async function saveFile() {
    if (!editor) return;
    setEditor({ ...editor, saving: true });
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/files/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: editor.file, content: editor.content }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not save that file.');
      setEditor(null);
      await load(path);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that file.');
      setEditor((current) => (current ? { ...current, saving: false } : current));
    }
  }

  const segments = path.split('/').filter(Boolean);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
          <button type="button" onClick={() => void load('/')} className="font-semibold text-jasfer-300 hover:text-jasfer-200">
            root
          </button>
          {segments.map((segment, index) => {
            const target = `/${segments.slice(0, index + 1).join('/')}`;
            return (
              <span key={target} className="flex items-center gap-1">
                <span className="text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => void load(target)}
                  className={index === segments.length - 1 ? 'text-slate-200' : 'text-slate-400 hover:text-slate-200'}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating('')} disabled={busy}>
            New folder
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load(path)} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {creating !== null && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (creating.trim()) void act({ action: 'mkdir', path, name: creating.trim() });
          }}
        >
          <input
            className="input h-9 flex-1 text-xs"
            value={creating}
            onChange={(event) => setCreating(event.target.value)}
            placeholder="folder-name"
            autoFocus
            maxLength={120}
          />
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !creating.trim()}>
            Create
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating(null)}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-[11px] text-rose-200">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Size</th>
              <th className="px-3 py-2 font-semibold">Modified</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Reading directory from the node…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  This folder is empty.
                </td>
              </tr>
            )}
            {!loading &&
              entries.map((entry) => {
                const isDir = entry.type === 'dir';
                const isRenaming = renaming?.name === entry.name;
                return (
                  <tr key={entry.name} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-2">
                      {isRenaming ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (renaming.value.trim())
                              void act({ action: 'rename', path, from: entry.name, to: renaming.value.trim() });
                          }}
                        >
                          <input
                            className="input h-8 text-xs"
                            value={renaming.value}
                            onChange={(event) => setRenaming({ name: entry.name, value: event.target.value })}
                            autoFocus
                          />
                          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setRenaming(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (isDir ? void load(childPath(path, entry.name)) : void openFile(entry))}
                          className="flex items-center gap-2 text-left"
                        >
                          <span className={isDir ? 'text-jasfer-300' : 'text-slate-500'}>
                            {isDir ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M3 7h6l2 2h10v9H3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className="truncate font-mono text-[11px] text-slate-200 hover:text-white">{entry.name}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{isDir ? '—' : humanSize(entry.size)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/5 hover:text-white"
                          onClick={() => setRenaming({ name: entry.name, value: entry.name })}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                          onClick={() => {
                            if (window.confirm(`Delete ${entry.name}? This cannot be undone.`)) {
                              void act({ action: 'delete', path, names: [entry.name] });
                            }
                          }}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-950/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex h-full w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-void-900">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-white">{editor.file}</p>
                <p className="text-[10px] text-slate-500">
                  {editor.editable ? 'Editable text file · 500 KB limit' : 'Binary or unsupported file — read only'}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditor(null)}>
                Close
              </button>
            </div>
            <textarea
              className="flex-1 resize-none bg-void-950/80 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none"
              value={editor.content}
              readOnly={!editor.editable}
              spellCheck={false}
              onChange={(event) => setEditor({ ...editor, content: event.target.value })}
            />
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
              <p className="text-[10px] text-slate-500">{editor.content.length.toLocaleString()} characters</p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => void saveFile()}
                  disabled={!editor.editable || editor.saving}
                >
                  {editor.saving ? 'Saving…' : 'Save file'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
