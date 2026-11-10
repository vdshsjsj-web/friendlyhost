'use client';

import { useState } from 'react';
import type { InstalledPlugin, PublicServer } from './ServerWorkspace';

type Result = {
  projectId: string;
  slug?: string;
  name?: string;
  description?: string;
  iconUrl?: string | null;
  downloads?: number;
};

export default function PluginManager({
  serverId,
  server,
  plugins,
  onChanged,
}: {
  serverId: string;
  server: PublicServer;
  plugins: InstalledPlugin[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const kind = server.software === 'fabric' || server.software === 'forge' ? 'mods' : 'plugins';
  const supported = server.edition === 'java' && server.software !== 'vanilla';

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams({ q: query.trim() || 'essentials' });
      params.set('software', server.software);
      params.set('version', server.version);
      const response = await fetch(`/api/plugins/search?${params.toString()}`, { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as { results?: Result[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Modrinth search failed.');
      setResults(data.results ?? []);
      setSearched(true);
      if ((data.results ?? []).length === 0) {
        setNotice('No compatible projects found on Modrinth for this software and version.');
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Modrinth search failed.');
    } finally {
      setLoading(false);
    }
  }

  async function install(projectId: string) {
    setInstalling(projectId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; plugin?: { name: string } };
      if (!response.ok) throw new Error(data.error || 'Could not install that project.');
      setNotice(`${data.plugin?.name ?? 'Project'} downloaded to /${kind}. Restart the server to load it.`);
      onChanged();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : 'Could not install that project.');
    } finally {
      setInstalling(null);
    }
  }

  async function remove(plugin: InstalledPlugin) {
    if (!window.confirm(`Remove ${plugin.name}? The file is deleted from /${plugin.target}.`)) return;
    setRemoving(plugin.id);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/plugins?pluginId=${encodeURIComponent(plugin.id)}`, {
        method: 'DELETE',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not remove that plugin.');
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove that plugin.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Install {kind} from Modrinth
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Files are downloaded directly to <span className="font-mono text-slate-400">/{kind}</span> on the node.
              Modrinth is free and needs no API key.
            </p>
          </div>
          <span className="chip">{server.edition === 'bedrock' ? 'Bedrock' : `${server.software} ${server.version}`}</span>
        </div>

        {!supported ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-slate-400">
            {server.edition === 'bedrock'
              ? 'Bedrock servers use .mcpack addons instead of plugins. Switch the server to a Java software to manage plugins and mods here.'
              : 'Vanilla servers do not load plugins. Recreate the server on Paper or Purpur (or Fabric/Forge for mods) to use this manager.'}
          </p>
        ) : (
          <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Modrinth — e.g. EssentialsX, LuckPerms, WorldEdit"
              aria-label="Search Modrinth"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
        )}

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

        {results.length > 0 && (
          <ul className="mt-3 space-y-2">
            {results.map((result) => (
              <li
                key={result.projectId}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-void-950/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {result.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.iconUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-lg" loading="lazy" />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-jasfer-500/15 text-[10px] font-bold text-jasfer-200">
                      {(result.name ?? result.slug ?? '?').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{result.name ?? result.slug ?? result.projectId}</p>
                    <p className="line-clamp-1 text-[10px] text-slate-500">
                      {result.description ?? 'No description'} · {(result.downloads ?? 0).toLocaleString()} downloads
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-sm shrink-0"
                  onClick={() => void install(result.projectId)}
                  disabled={installing !== null}
                >
                  {installing === result.projectId ? 'Installing…' : 'Install'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searched && results.length === 0 && !loading && !notice && (
          <p className="mt-3 text-[11px] text-slate-500">No results.</p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Installed ({plugins.length})</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Tracked installs from this panel.</p>
        </div>
        {plugins.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">Nothing installed yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {plugins.map((plugin) => (
              <li key={plugin.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{plugin.name}</p>
                  <p className="truncate font-mono text-[10px] text-slate-500">
                    {plugin.version} · /{plugin.target}/{plugin.fileName}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-danger btn-sm shrink-0"
                  onClick={() => void remove(plugin)}
                  disabled={removing !== null}
                >
                  {removing === plugin.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
