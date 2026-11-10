import { getDb, type NodeRow, type PlanRow, type ServerRow, type UserRow } from './db';
import { ApiError } from './api';

export type ServerBundle = {
  server: ServerRow;
  plan: PlanRow | null;
  node: NodeRow | null;
};

export function canManage(user: UserRow, server: ServerRow): boolean {
  return user.role === 'admin' || server.owner_id === user.id;
}

export function loadServer(serverId: string): ServerBundle {
  const db = getDb();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerRow | undefined;
  if (!server) throw new ApiError('Server not found.', 404);
  const plan = server.plan_id
    ? ((db.prepare('SELECT * FROM plans WHERE id = ?').get(server.plan_id) as PlanRow | undefined) ?? null)
    : null;
  const node = server.node_id
    ? ((db.prepare('SELECT * FROM nodes WHERE id = ?').get(server.node_id) as NodeRow | undefined) ?? null)
    : null;
  return { server, plan, node };
}

export function requireServerAccess(serverId: string, user: UserRow): ServerBundle {
  const bundle = loadServer(serverId);
  if (!canManage(user, bundle.server)) throw new ApiError('This server belongs to another account.', 403);
  return bundle;
}

/** Shape sent to the browser - never includes node credentials. */
export function publicServer(server: ServerRow, plan: PlanRow | null, node: NodeRow | null) {
  return {
    id: server.id,
    name: server.name,
    software: server.software,
    version: server.version,
    edition: server.edition,
    status: server.status,
    statusMessage: server.status_message,
    ip: server.ip,
    port: server.port,
    motd: server.motd,
    ramMb: server.ram_mb,
    cpuPercent: server.cpu_percent,
    storageMb: server.storage_mb,
    createdAt: server.created_at,
    updatedAt: server.updated_at,
    lastStatusAt: server.last_status_at,
    plan: plan ? { id: plan.id, name: plan.name, slug: plan.slug, ramMb: plan.ram_mb, storageMb: plan.storage_mb } : null,
    node: node
      ? {
          id: node.id,
          name: node.name,
          provider: node.provider,
          location: node.location,
          status: node.status,
          configured: node.provider === 'local' ? true : Boolean(node.api_url && node.api_key_enc && node.client_key_enc),
        }
      : null,
  };
}
