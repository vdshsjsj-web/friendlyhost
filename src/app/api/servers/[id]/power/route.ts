import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { requireServerAccess } from '@/lib/server-access';
import { providerFor } from '@/lib/providers';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ action: z.enum(['start', 'stop', 'restart', 'kill']) });

const NEXT_STATUS: Record<string, 'starting' | 'stopping'> = {
  start: 'starting',
  restart: 'starting',
  stop: 'stopping',
  kill: 'stopping',
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    assertRateLimit(`power:${id}:${user.id}`, 20, 60_000);

    const { server, node } = requireServerAccess(id, user);
    const { action } = schema.parse(await readJson(request));

    if (server.status === 'suspended') {
      throw new ApiError('This server is suspended. An administrator has to reactivate it first.', 403);
    }
    if (server.status === 'provisioning') {
      throw new ApiError('This server is still being installed on the node. Try again in a moment.', 409);
    }
    if (!node) throw new ApiError('This server is not attached to a node.', 409);

    const provider = await providerFor(server);
    try {
      await provider.power(server, action);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      // A missing runtime or exhausted node is a capacity problem, not a
      // rejected command: report it as unavailable and keep the real cause.
      const unavailable = /not available on this node|not enough free memory|could not find|ENOENT|is missing/i.test(
        message
      );
      throw new ApiError(`The node rejected the ${action} command: ${message}`, unavailable ? 503 : 502);
    }

    getDb()
      .prepare(
        `UPDATE servers SET status = ?, status_message = NULL, updated_at = datetime('now'),
         last_status_at = datetime('now') WHERE id = ?`
      )
      .run(NEXT_STATUS[action], id);

    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      serverId: id,
      action: `server.${action}`,
      detail: `${action} requested on ${node.name}`,
      ip: getClientIp(request),
    });

    return json({ ok: true, status: NEXT_STATUS[action] });
  } catch (error) {
    return errorResponse(error);
  }
}
