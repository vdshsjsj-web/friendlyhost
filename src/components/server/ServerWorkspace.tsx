'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusPill from './StatusPill';
import ConsolePanel from './ConsolePanel';
import FileManager from './FileManager';
import PluginManager from './PluginManager';
import ServerSettings from './ServerSettings';

export type PublicServer = {
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
  createdAt: string;
  updatedAt: string;
  lastStatusAt: string | null;
  plan: { id: string; name: string; slug: string; ramMb: number; storageMb: number } | null;
  node: { id: string; name: string; provider: string; location: string | null; status: string; configured: boolean } | null;
};

export type LiveStatus = {
  state?: string;
  message?: string | null;
  players?: string[];
  playerCount?: number;
  maxPlayers?: number;
  cpuPercent?: number | null;
  ramUsedMb?: number | null;
  uptimeSeconds?: number | null;
  pid?: number | null;
};

export type InstalledPlugin = {
  id: string;
  projectId: string;
  name: string;
  version: string;
  fileName: string;
  target: string;
  installedAt: string;
};

type ActivityItem = { action: string; detail: string | null; at: string };
type Tab = 'console' | 'files' | 'plugins' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'console', label: 'Console' },
  { id: 'files', label: 'Files' },
  { id: 'plugins', label: 'Plugins & mods' },
  { id: 'settings', label: 'Settings' },
];

function formatUptime(seconds?: number | null) {
  if (!seconds || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

export default function ServerWorkspace({
  server: initialServer,
  plugins: initialPlugins,
  activity,
  isOwner,
}: {
  server: PublicServer;
  plugins: InstalledPlugin[];
  activity: ActivityItem[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [server, setServer] = useState(initialServer);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [tab, setTab] = useState<Tab>('console');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/servers/${server.id}`, { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as {
        server?: PublicServer;
        live?: LiveStatus | null;
        liveError?: string | null;
        plugins?: InstalledPlugin[];
      };
      if (!mounted.current || !response.ok) return;
      if (data.server) setServer(data.server);
      if (data.live) setLive(data.live);
      setLiveError(data.liveError ?? null);
      if (Array.isArray(data.plugins)) setPlugins(data.plugins);
    } catch {
      /* transient - keep last known state */
    }
  }, [server.id]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const address = server.ip && server.port ? `${server.ip}:${server.port}` : 'Pending allocation';

  async function power(action: 'start' | 'stop' | 'restart' | 'kill') {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${server.id}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || `The node rejected the ${action} command.`);
      await refresh();
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

  const suspended = server.status === 'suspended';
  const state = live?.state ?? server.status;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs font-medium text-slate-400 transition hover:text-jasfer-300">
          ← All servers
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-bold tracking-tight text-white">{server.name}</h1>
              <StatusPill status={server.status} size="md" />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {server.edition === 'bedrock' ? 'Bedrock Edition' : `${server.software} ${server.version}`} ·{' '}
              {server.node ? `${server.node.name} (${server.node.provider})` : 'no node'} · {server.plan?.name ?? 'no plan'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => power('start')}
              disabled={Boolean(busy) || suspended || state === 'running' || state === 'starting'}
            >
              {busy === 'start' ? 'Starting…' : 'Start'}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => power('restart')}
              disabled={Boolean(busy) || suspended || state === 'offline' || state === 'provisioning'}
            >
              {busy === 'restart' ? 'Restarting…' : 'Restart'}
            </button>
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={() => power('stop')}
              disabled={Boolean(busy) || suspended || state === 'offline' || state === 'provisioning'}
            >
              {busy === 'stop' ? 'Stopping…' : 'Stop'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
          {error}
        </p>
      )}
      {suspended && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
          This server is suspended by an administrator. Power controls stay disabled until it is reactivated.
        </p>
      )}
      {liveError && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-200">
          Node status unavailable: {liveError}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={copyAddress}
          className="card col-span-2 p-4 text-left transition hover:border-jasfer-400/30 lg:col-span-1"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Address</p>
          <p className="mt-1.5 truncate font-mono text-sm text-white">{address}</p>
          <p className="mt-0.5 text-[10px] text-jasfer-300">{copied ? 'Copied to clipboard' : 'Tap to copy'}</p>
        </button>
        {[
          { label: 'Players', value: live ? `${live.playerCount ?? 0} / ${live.maxPlayers ?? 20}` : '—' },
          { label: 'CPU', value: live?.cpuPercent != null ? `${live.cpuPercent}%` : '—' },
          { label: 'RAM', value: live?.ramUsedMb != null ? `${live.ramUsedMb} / ${server.ramMb} MB` : `0 / ${server.ramMb} MB` },
          { label: 'Uptime', value: formatUptime(live?.uptimeSeconds) },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
            <p className="mt-1.5 truncate text-sm font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </section>

      {live && Array.isArray(live.players) && live.players.length > 0 && (
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Online now:</span> {live.players.join(', ')}
        </p>
      )}

      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              tab === item.id
                ? 'bg-jasfer-500/15 text-white ring-1 ring-inset ring-jasfer-400/30'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === 'console' && (
          <ConsolePanel serverId={server.id} state={state} onRefresh={refresh} onError={setError} />
        )}
        {tab === 'files' && <FileManager serverId={server.id} />}
        {tab === 'plugins' && (
          <PluginManager
            serverId={server.id}
            server={server}
            plugins={plugins}
            onChanged={() => {
              void refresh();
              router.refresh();
            }}
          />
        )}
        {tab === 'settings' && (
          <ServerSettings server={server} activity={activity} isOwner={isOwner} onSaved={refresh} />
        )}
      </div>
    </div>
  );
}
