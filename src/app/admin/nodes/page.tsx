import NodeManager from '@/components/admin/NodeManager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nodes' };

export default function AdminNodesPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Administration</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Server nodes</h1>
        <p className="mt-1.5 text-sm muted">
          A node is where Minecraft processes actually run. Use the local runtime for this machine, or connect your own
          Pterodactyl panel — the Jasfer frontend stays fully custom either way.
        </p>
      </header>
      <NodeManager />
    </div>
  );
}
