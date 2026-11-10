import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb, type ServerPluginRow } from '@/lib/db';
import { canManage, loadServer, publicServer, type ServerBundle } from '@/lib/server-access';
import ServerWorkspace from '@/components/server/ServerWorkspace';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  try {
    const { id } = await params;
    const bundle = loadServer(id);
    return { title: bundle.server.name };
  } catch {
    return { title: 'Server' };
  }
}

export default async function ServerDetailPage({ params }: Params) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  let bundle: ServerBundle | null = null;
  try {
    bundle = loadServer(id);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();
  if (!canManage(user, bundle.server)) notFound();

  const db = getDb();
  const plugins = db
    .prepare('SELECT * FROM server_plugins WHERE server_id = ? ORDER BY installed_at DESC')
    .all(id) as ServerPluginRow[];
  const activity = db
    .prepare('SELECT action, detail, created_at FROM activity WHERE server_id = ? ORDER BY created_at DESC LIMIT 15')
    .all(id) as { action: string; detail: string | null; created_at: string }[];

  return (
    <ServerWorkspace
      server={publicServer(bundle.server, bundle.plan, bundle.node)}
      plugins={plugins.map((plugin) => ({
        id: plugin.id,
        projectId: plugin.project_id ?? '',
        name: plugin.name,
        version: plugin.version,
        fileName: plugin.file_name,
        target: plugin.target,
        installedAt: plugin.installed_at,
      }))}
      activity={activity.map((row) => ({ action: row.action, detail: row.detail, at: row.created_at }))}
      isOwner={bundle.server.owner_id === user.id}
    />
  );
}
