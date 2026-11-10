'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const SOFTWARE = [
  { id: 'paper', name: 'Paper', note: 'Plugins · high performance' },
  { id: 'purpur', name: 'Purpur', note: 'Plugins · Paper fork with extras' },
  { id: 'vanilla', name: 'Vanilla', note: 'Official Mojang server' },
  { id: 'fabric', name: 'Fabric', note: 'Mods · lightweight loader' },
  { id: 'forge', name: 'Forge', note: 'Mods · classic mod loader' },
];

type Plan = { id: string; name: string; ramMb: number; storageMb: number };

export default function CreateServerForm({
  plan,
  canCreate,
  nodeConnected,
  isAdmin,
}: {
  plan: Plan | null;
  canCreate: boolean;
  nodeConnected: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [edition, setEdition] = useState<'java' | 'bedrock'>('java');
  const [software, setSoftware] = useState('paper');
  const [version, setVersion] = useState('');
  const [versions, setVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadVersions = useCallback(async (nextSoftware: string, nextEdition: 'java' | 'bedrock') => {
    setLoadingVersions(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/minecraft/versions?software=${encodeURIComponent(nextSoftware)}&edition=${nextEdition}`,
        { cache: 'no-store' }
      );
      const data = (await response.json().catch(() => ({}))) as {
        versions?: string[];
        recommended?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Could not load Minecraft versions.');
      setVersions(data.versions ?? []);
      setVersion(data.recommended ?? data.versions?.[0] ?? '');
    } catch (loadError) {
      setVersions([]);
      setVersion('');
      setError(loadError instanceof Error ? loadError.message : 'Could not load Minecraft versions.');
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadVersions(software, edition);
  }, [open, software, edition, loadVersions]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          software: edition === 'bedrock' ? 'vanilla' : software,
          edition,
          version: edition === 'bedrock' ? 'latest' : version,
          planId: plan?.id,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: { message?: string }[] | null;
        server?: { id: string };
      };
      if (!response.ok) {
        const fieldError = Array.isArray(data.details) ? data.details.find((item) => item?.message)?.message : null;
        throw new Error(fieldError || data.error || 'Could not create the server.');
      }
      setOpen(false);
      setName('');
      router.refresh();
      if (data.server?.id) router.push(`/dashboard/servers/${data.server.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the server.');
    } finally {
      setBusy(false);
    }
  }

  const disabledReason = !plan
    ? 'You need a hosting plan before creating a server.'
    : !canCreate
      ? 'Your plan already has the maximum number of servers.'
      : null;

  return (
    <>
      <button
        type="button"
        className="btn-primary w-full sm:w-auto"
        onClick={() => setOpen(true)}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Create server
      </button>

      {disabledReason && <p className="text-right text-[11px] text-slate-500">{disabledReason}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-void-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!busy) setOpen(false);
            }}
          />
          <div className="relative w-full max-w-lg rounded-t-3xl border border-white/10 bg-void-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Create a Minecraft server</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {plan ? `${plan.name} · ${plan.ramMb} MB RAM · ${plan.storageMb} MB disk` : 'No plan attached'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {!nodeConnected && (
              <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-200">
                No node is connected, so provisioning will fail with a setup error.
                {isAdmin ? ' Add one in Admin → Nodes first.' : ' Ask an administrator to connect a node.'}
              </p>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="server-name">
                  Server name
                </label>
                <input
                  id="server-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="survival-smp"
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[A-Za-z0-9 _.\-]+"
                />
                <p className="mt-1 text-[11px] text-slate-500">Letters, numbers, spaces, dashes and dots.</p>
              </div>

              <div>
                <span className="label">Edition</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['java', 'bedrock'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setEdition(option)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                        edition === option
                          ? 'border-jasfer-400/50 bg-jasfer-500/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'
                      }`}
                    >
                      {option === 'java' ? 'Java Edition' : 'Bedrock Edition'}
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                        {option === 'java' ? 'PC · plugins & mods' : 'Phones & consoles · UDP'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {edition === 'java' && (
                <div>
                  <span className="label">Software</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SOFTWARE.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSoftware(option.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          software === option.id
                            ? 'border-jasfer-400/50 bg-jasfer-500/15'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <span className={`block text-xs font-semibold ${software === option.id ? 'text-white' : 'text-slate-300'}`}>
                          {option.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">{option.note}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label" htmlFor="server-version">
                  Minecraft version
                </label>
                {edition === 'bedrock' ? (
                  <p className="rounded-xl border border-white/10 bg-void-950/60 px-3.5 py-2.5 text-xs text-slate-400">
                    Bedrock Dedicated Server always installs the latest release.
                  </p>
                ) : (
                  <select
                    id="server-version"
                    className="input"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    disabled={loadingVersions || versions.length === 0}
                    required
                  >
                    {loadingVersions && <option value="">Loading versions…</option>}
                    {!loadingVersions && versions.length === 0 && <option value="">No versions available</option>}
                    {versions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy || !version || !plan}>
                  {busy ? 'Provisioning…' : 'Create server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
