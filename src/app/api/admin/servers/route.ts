import { z } from 'zod';
import { getDb, type ServerRow } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { providerFor } from '@/lib/providers';

const schema = z.object({
  serverId: z.string().min(3),
  action: z.enum(['suspend', 'activate', 'stop', 'start', 'restart', 'delete']),
});

export async function GET() {
  try {
    await requireAdmin();
    const servers = getDb()
      .prepare(
        `SELECT s.*, u.email AS owner_email, n.name AS node_name, n.provider AS node_provider, p.name AS plan_name
         FROM servers s LEFT JOIN users u ON u.id = s.owner_id
         LEFT JOIN nodes n ON n.id = s.node_id LEFT JOIN plans p ON p.id = s.plan_id
         ORDER BY s.created_at DESC`
      )
      .all();
    return json({ servers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const { serverId, action } = schema.parse(await readJson(request));
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerRow | undefined;
    if (!server) throw new ApiError('Server not found.', 404);

    if (action === 'suspend' || action === 'activate') {
      if (action === 'suspend') {
        try {
          const provider = await providerFor(server);
          await provider.power(server, 'stop');
        } catch {
          // The node may be unreachable; suspension still takes effect in the panel.
        }
        db.prepare(
          `UPDATE servers SET status = 'suspended', status_message = 'Suspended by an administrator', updated_at = datetime('now') WHERE id = ?`
        ).run(serverId);
      } else {
        db.prepare(
          `UPDATE servers SET status = 'offline', status_message = NULL, updated_at = datetime('now') WHERE id = ?`
        ).run(serverId);
      }
      logActivity({
        actorId: admin.id,
        userId: server.owner_id,
        serverId,
        action: `admin.server.${action}`,
        detail: `${server.name} ${action}d`,
        ip: getClientIp(request),
      });
      return json({ ok: true, status: action === 'suspend' ? 'suspended' : 'offline' });
    }

    if (server.status === 'suspended') throw new ApiError('Activate this server before controlling it.', 409);
    const provider = await providerFor(server);
    try {
      await provider.power(server, action === 'delete' ? 'stop' : action);
    } catch (error) {
      throw new ApiError(
        `The node rejected the command: ${error instanceof Error ? error.message : 'unknown error'}`,
        502
      );
    }
    db.prepare(`UPDATE servers SET updated_at = datetime('now') WHERE id = ?`).run(serverId);
    logActivity({
      actorId: admin.id,
      userId: server.owner_id,
      serverId,
      action: `admin.server.${action}`,
      detail: server.name,
      ip: getClientIp(request),
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
