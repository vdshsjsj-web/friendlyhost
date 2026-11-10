import Link from 'next/link';
import { getDb, type PlanRow } from '@/lib/db';
import { platformStatus } from '@/lib/providers';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SOFTWARE } from '@/lib/minecraft';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    title: 'Live console over WebSocket',
    body: 'A real bidirectional console: watch stdout/stderr stream from the JVM and type commands back. No polling, no mocked lines.',
    icon: 'M4 6h16M4 6v12h16V6M7 10l3 2-3 2m5 0h4',
  },
  {
    title: 'File manager & editor',
    body: 'Browse the server directory, create folders, rename, delete and edit server.properties, YAML and JSON with a built-in editor.',
    icon: 'M4 7h5l2 2h9v9H4V7Z',
  },
  {
    title: 'Plugin & mod installer',
    body: 'Search Modrinth by name, and the node downloads the matching jar straight into /plugins or /mods. No re-uploading files.',
    icon: 'M12 3v6m0 0 4-2m-4 2-4-2M5 12v6h14v-6',
  },
  {
    title: 'Paper, Purpur, Vanilla, Fabric, Forge',
    body: 'Versions are resolved from each project’s own API, so the selector always reflects what is actually installable today.',
    icon: 'M4 5h16v5H4zM4 14h16v5H4z',
  },
  {
    title: 'Java & Bedrock editions',
    body: 'Java servers get plugins and mods. Bedrock runs the official Bedrock Dedicated Server on UDP 19132 for phones and consoles.',
    icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z',
  },
  {
    title: 'Hard resource limits',
    body: 'Every plan defines RAM, CPU and disk. The panel enforces them on creation and the JVM is launched with -Xmx from the plan.',
    icon: 'M12 3v18M5 8h14M5 16h14',
  },
];

const FAQ = [
  {
    q: 'Does Jasfer Hosting really start Minecraft servers?',
    a: 'Yes — when a local node is available, the panel downloads the official server jar for the chosen software/version, writes server.properties and launches a real JVM process with the RAM limit from your plan. If no node is connected, server creation fails with a setup message instead of pretending to work.',
  },
  {
    q: 'How do I connect my own infrastructure?',
    a: 'Use the built-in local node (Java runtime on the same machine), or register a Pterodactyl/Pelican-compatible panel in Admin → Nodes with an Application API key and a Client API key. Keys are encrypted at rest and never returned to the browser.',
  },
  {
    q: 'Where are the API keys stored?',
    a: 'Only in the server-side SQLite database, encrypted with AES-256-GCM using a key derived from JASFER_SECRET. The admin API returns a boolean “configured” flag, never the key itself.',
  },
  {
    q: 'Is this a paid service?',
    a: 'No. Jasfer Hosting is open source under the MIT license. The plans shipped with it are limits you control — the Free plan is genuinely usable and you can edit or add plans in the admin dashboard.',
  },
  {
    q: 'What are the system requirements?',
    a: 'Node.js 20+ and a JDK (17 or 21 recommended for modern Minecraft). Bedrock needs a Linux x86_64 host for the official Bedrock Dedicated Server binary.',
  },
];

function priceLabel(plan: PlanRow) {
  if (plan.price_cents === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: plan.currency || 'USD',
      minimumFractionDigits: plan.price_cents % 100 === 0 ? 0 : 2,
    }).format(plan.price_cents / 100);
  } catch {
    return `$${(plan.price_cents / 100).toFixed(2)}`;
  }
}

function featuresOf(plan: PlanRow): string[] {
  try {
    const parsed = JSON.parse(plan.features || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function gb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

export default async function LandingPage() {
  const plans = getDb()
    .prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC, price_cents ASC')
    .all() as PlanRow[];

  let platform: Awaited<ReturnType<typeof platformStatus>> | null = null;
  try {
    platform = await platformStatus();
  } catch {
    platform = null;
  }

  const java = platform?.local.java;
  const javaReady = Boolean(java?.available);
  const pterodactylReady = (platform?.pterodactyl.configured ?? 0) > 0;
  const anyNode = Boolean(platform?.connected);

  return (
    <div className="relative overflow-hidden">
      <SiteHeader />

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
        <div className="aurora" aria-hidden />
        <div className="absolute inset-0 grid-backdrop" aria-hidden />
        <div className="container-page relative">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-fade-up">
              <span className="chip border-jasfer-400/30 bg-jasfer-500/10 text-jasfer-200">
                <span className={`inline-flex h-1.5 w-1.5 rounded-full ${javaReady ? 'bg-emerald-400 live-dot' : 'bg-amber-400'}`} />
                {javaReady ? 'Local Java node detected' : 'Open source · MIT licensed'}
              </span>

              <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
                Minecraft hosting
                <span className="block text-gradient">that actually runs.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Jasfer Hosting is a complete hosting panel for Paper, Purpur, Vanilla, Fabric, Forge and Bedrock.
                Real JVM processes, a live WebSocket console, file manager and plugin installer — backed by a
                secure adapter for your own nodes.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                  Create your first server
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="/login" className="btn-ghost px-6 py-3 text-base">
                  Sign in to the panel
                </Link>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/[0.07] pt-6">
                {[
                  { k: 'Software', v: '5 + Bedrock' },
                  { k: 'Console', v: 'WebSocket' },
                  { k: 'License', v: 'MIT' },
                ].map((item) => (
                  <div key={item.k}>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.k}</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{item.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* console preview */}
            <div className="animate-fade-up delay-2">
              <div className="card overflow-hidden shadow-glow-lg">
                <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                    <span className="ml-2 text-xs font-medium text-slate-400">survival-smp · console</span>
                  </div>
                  <span className="chip border-emerald-400/20 bg-emerald-500/10 py-0.5 text-[10px] text-emerald-300">LIVE</span>
                </div>
                <div className="console h-[268px] overflow-hidden p-4 text-slate-300 sm:h-[300px]">
                  <p className="console-line text-slate-500">$ jasfer provision --software paper --version 1.21.8</p>
                  <p className="console-line text-jasfer-300">[runtime] resolving Paper 1.21.8 build from PaperMC…</p>
                  <p className="console-line text-jasfer-300">[runtime] writing eula=true, server.properties, -Xmx2048M</p>
                  <p className="console-line text-emerald-300">[12:04:01] [Server thread/INFO]: Starting minecraft server version 1.21.8</p>
                  <p className="console-line text-slate-400">[12:04:02] [Server thread/INFO]: Preparing level &quot;world&quot;</p>
                  <p className="console-line text-slate-400">[12:04:06] [Server thread/INFO]: Preparing start region for dimension minecraft:overworld</p>
                  <p className="console-line text-emerald-300">[12:04:08] [Server thread/INFO]: Done (6.912s)! For help, type &quot;help&quot;</p>
                  <p className="console-line text-fuchsia-300">[12:04:12] [Server thread/INFO]: Alex joined the game</p>
                  <p className="console-line text-slate-500">
                    &gt; <span className="animate-blink text-white">_</span>
                  </p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-t border-white/[0.07] text-center">
                  {[
                    { k: 'RAM', v: '2 GB' },
                    { k: 'CPU', v: '150%' },
                    { k: 'Disk', v: '10 GB' },
                  ].map((item) => (
                    <div key={item.k} className="px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{item.k}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-500">
                Interface preview — your real console streams over <code className="text-jasfer-300">ws://…/console</code>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ software */}
      <section className="border-y border-white/[0.06] bg-void-900/40 py-8">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Supported software</span>
            {Object.values(SOFTWARE).map((item) => (
              <span key={item.id} className="font-semibold text-slate-300">
                {item.name}
                {item.recommended && <span className="ml-1.5 text-[10px] font-bold uppercase text-jasfer-300">rec</span>}
              </span>
            ))}
            <span className="font-semibold text-slate-300">Bedrock Dedicated</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section id="features" className="scroll-mt-20 py-20 sm:py-28">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-jasfer-300">Everything in the panel</p>
            <h2 className="section-title mt-3">Built like a real hosting company, not a mockup.</h2>
            <p className="mt-4 text-slate-400">
              Every control below talks to a live provider adapter. When a node is missing, the panel says so
              instead of faking a running server.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="card card-hover group p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-jasfer-400/25 bg-jasfer-500/10 text-jasfer-300 transition group-hover:border-jasfer-400/50 group-hover:text-jasfer-200">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d={feature.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- plans */}
      <section id="plans" className="scroll-mt-20 border-y border-white/[0.06] bg-void-900/30 py-20 sm:py-28">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-jasfer-300">Plans</p>
            <h2 className="section-title mt-3">Start free. Scale when your world grows.</h2>
            <p className="mt-4 text-slate-400">
              Plans are resource limits enforced by the panel — RAM, CPU and disk are applied when your server is
              provisioned.
            </p>
          </div>

          {plans.length === 0 ? (
            <p className="mt-12 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center text-sm text-amber-200">
              No plans are active yet. Run <code className="font-mono">npm run seed</code> or create one in the admin
              dashboard.
            </p>
          ) : (
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => {
                const featured = Boolean(plan.is_free) || plan.slug === 'premium';
                return (
                  <article
                    key={plan.id}
                    className={`card relative flex flex-col p-6 ${
                      plan.is_free
                        ? 'border-jasfer-400/40 bg-gradient-to-b from-jasfer-500/[0.12] to-transparent shadow-glow'
                        : 'card-hover'
                    }`}
                  >
                    {plan.is_free && (
                      <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-jasfer-500 to-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                        Most popular
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                    <p className="mt-1 min-h-[40px] text-sm text-slate-400">{plan.description}</p>
                    <p className="mt-4 flex items-end gap-1.5">
                      <span className="text-4xl font-extrabold tracking-tight text-white">{priceLabel(plan)}</span>
                      {plan.price_cents > 0 && <span className="pb-1 text-xs text-slate-500">/ month</span>}
                    </p>

                    <dl className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.07] bg-void-950/40 p-3 text-center">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">RAM</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-white">{gb(plan.ram_mb)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">CPU</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-white">{plan.cpu_percent}%</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Disk</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-white">{gb(plan.storage_mb)}</dd>
                      </div>
                    </dl>

                    <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                      <li className="flex items-start gap-2 text-slate-300">
                        <Check />
                        {plan.max_servers} server{plan.max_servers === 1 ? '' : 's'} included
                      </li>
                      {featuresOf(plan).map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-slate-300">
                          <Check />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/signup"
                      className={`mt-6 w-full ${plan.is_free || featured ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {plan.price_cents === 0 ? 'Start for free' : `Choose ${plan.name}`}
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ infrastructure */}
      <section id="infrastructure" className="scroll-mt-20 py-20 sm:py-28">
        <div className="container-page grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-jasfer-300">Infrastructure</p>
            <h2 className="section-title mt-3">Your hardware. Your keys. Our panel.</h2>
            <p className="mt-4 text-slate-400">
              Jasfer Hosting never pretends to own servers. It ships with two adapters and reports their real state
              right here — detected on this deployment just now.
            </p>

            <div className="mt-8 space-y-3">
              <div className="card flex items-start gap-3 p-4">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${javaReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Local Java runtime {javaReady ? '· ready' : '· not detected'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {javaReady
                      ? `${java?.version ?? 'Java'} on this host. Servers are real JVM child processes with the plan’s -Xmx.`
                      : 'Install a JDK (17 or 21) on this host to provision servers locally.'}
                  </p>
                </div>
              </div>

              <div className="card flex items-start gap-3 p-4">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${pterodactylReady ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Pterodactyl-compatible node {pterodactylReady ? '· connected' : '· not configured'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {pterodactylReady
                      ? 'The panel can create, power and stream console output from your own Pterodactyl nodes.'
                      : 'Add a panel URL, Application API key and Client API key in Admin → Nodes to attach your own infrastructure.'}
                  </p>
                </div>
              </div>

              <div className="card flex items-start gap-3 p-4">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${anyNode ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Server creation {anyNode ? 'enabled' : 'locked until a node is connected'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {anyNode
                      ? 'A configured node is active, so the create-server flow will really provision on it.'
                      : 'Without a node the API returns a clear setup error — it will never show a fake “running” server.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-white/[0.07] bg-white/[0.02] px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Adapter contract</p>
            </div>
            <div className="space-y-4 p-5 text-sm">
              {[
                {
                  k: 'POST /api/servers',
                  v: 'Chooses a node with free capacity, allocates a free port, then provisions in the background.',
                },
                {
                  k: 'POST /api/servers/:id/power',
                  v: 'Sends start / stop / restart / kill to the provider and mirrors the returned state.',
                },
                {
                  k: 'WS /api/servers/:id/console',
                  v: 'Session-cookie authenticated socket; relays real stdout and accepts command frames.',
                },
                {
                  k: 'GET /api/servers/:id/files',
                  v: 'Provider-neutral file API — local filesystem or Pterodactyl client endpoints.',
                },
              ].map((row) => (
                <div key={row.k} className="rounded-xl border border-white/[0.06] bg-void-950/50 p-3.5">
                  <code className="text-[11px] font-semibold text-jasfer-300">{row.k}</code>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{row.v}</p>
                </div>
              ))}
              <p className="text-xs leading-relaxed text-slate-500">
                API keys are encrypted with AES-256-GCM (<code>JASFER_SECRET</code>) and are never sent to the
                browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- faq */}
      <section id="faq" className="scroll-mt-20 border-t border-white/[0.06] bg-void-900/30 py-20 sm:py-24">
        <div className="container-page max-w-3xl">
          <h2 className="section-title text-center">Questions, answered honestly</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white">
                  {item.q}
                  <span className="text-jasfer-300 transition group-open:rotate-45">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- cta */}
      <section className="py-20">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl border border-jasfer-400/25 bg-gradient-to-br from-jasfer-500/20 via-void-900 to-void-950 px-6 py-14 text-center sm:px-12">
            <div className="aurora opacity-60" aria-hidden />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Your world, on infrastructure you control.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm text-slate-300 sm:text-base">
                Create a free account, pick a plan and launch a Paper server in a couple of minutes.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                  Create free account
                </Link>
                <Link href="/login" className="btn-ghost px-6 py-3 text-base">
                  I already have one
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-jasfer-300" aria-hidden>
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
