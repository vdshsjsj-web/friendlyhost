import fs from 'node:fs/promises';
import { z } from 'zod';
import { getDb, type ServerRow } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { loadServer, publicServer, requireServerAccess } from '@/lib/server-access';
import { providerFor, pterodactylFor, safeServerPath, syncServerStatus } from '@/lib/providers';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const synced = await syncServerStatus(server);
    const bundle = loadServer(id);

    let live: Record<string, unknown> | null = null;
    let liveError: string | null = null;
    if (synced.status !== 'provisioning') {
      try {
        const provider = await providerFor(synced);
        live = await provider.status(synced);
      } catch (error) {
        liveError = error instanceof Error ? error.message : 'Provider unreachable';
      }
    }

    const db = getDb();
    const plugins = db
      .prepare('SELECT * FROM server_plugins WHERE server_id = ? ORDER BY installed_at DESC')
      .all(id) as unknown[];
    const activity = db
      .prepare('SELECT * FROM activity WHERE server_id = ? ORDER BY created_at DESC LIMIT 25')
      .all(id) as unknown[];

    return json({
      server: publicServer(bundle.server, bundle.plan, bundle.node),
      live,
      liveError,
      plugins,
      activity,
      isOwner: bundle.server.owner_id === user.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9 _.-]+$/)
    .optional(),
  motd: z.string().trim().max(120).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const body = patchSchema.parse(await readJson(request));
    if (!body.name && body.motd === undefined) throw new ApiError('Nothing to update.', 400);

    const db = getDb();
    db.prepare(
      `UPDATE servers SET name = COALESCE(?, name), motd = COALESCE(?, motd), updated_at = datetime('now') WHERE id = ?`
    ).run(body.name ?? null, body.motd ?? null, id);
    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      serverId: id,
      action: 'server.updated',
      detail: body.name ? `Renamed to ${body.name}` : 'MOTD updated',
      ip: getClientIp(request),
    });
    const bundle = loadServer(id);
    return json({ server: publicServer(bundle.server, bundle.plan, bundle.node) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server, node } = requireServerAccess(id, user);

    try {
      if (node?.provider === 'local') {
        const downloads = await import('@/lib/providers');
        const rt = await downloads.localRuntime();
        await rt.stop(id, { force: true }).catch(() => {});
        await fs.rm(safeServerPath(id, '/'), { recursive: true, force: true });
      } else if (node?.provider === 'pterodactyl' && server.provider_server_id) {
        const client = await pterodactylFor(node);
        await client.deleteServer(server.provider_server_id);
      }
    } catch (error) {
      throw new ApiError(
        `Could not remove the server from its node: ${error instanceof Error ? error.message : 'unknown error'}. Nothing was deleted.`,
        502
      );
    }

    const db = getDb();
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      action: 'server.deleted',
      detail: `${server.name} was deleted`,
      ip: getClientIp(request),
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export type { ServerRow };
