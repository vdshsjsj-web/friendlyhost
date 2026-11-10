import { z } from 'zod';
import { getDb, type ServerPluginRow } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { requireServerAccess } from '@/lib/server-access';
import { providerFor } from '@/lib/providers';
import { resolvePluginFile } from '@/lib/plugins';
import { randomId } from '@/lib/crypto.mjs';

type Params = { params: Promise<{ id: string }> };

const targetDir = (software: string) => (software === 'fabric' || software === 'forge' ? 'mods' : 'plugins');

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    requireServerAccess(id, user);
    const rows = getDb()
      .prepare('SELECT * FROM server_plugins WHERE server_id = ? ORDER BY installed_at DESC')
      .all(id) as ServerPluginRow[];
    return json({ plugins: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

const installSchema = z.object({ projectId: z.string().min(2).max(64) });

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    assertRateLimit(`plugin-install:${id}:${user.id}`, 15, 60_000);
    const { server } = requireServerAccess(id, user);
    const { projectId } = installSchema.parse(await readJson(request));

    if (server.edition !== 'java') {
      throw new ApiError('Plugins and mods are only available for Java servers. Bedrock uses .mcpack addons.', 400);
    }
    if (server.software === 'vanilla') {
      throw new ApiError('Vanilla servers do not load plugins. Switch to Paper, Purpur, Fabric or Forge first.', 400);
    }
    if (server.status === 'suspended') throw new ApiError('This server is suspended.', 403);

    let resolved;
    try {
      resolved = await resolvePluginFile({ projectId, software: server.software, version: server.version });
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : 'Could not resolve that project on Modrinth', 502);
    }

    const provider = await providerFor(server);
    try {
      await provider.installPlugin(server, {
        url: resolved.downloadUrl,
        fileName: resolved.fileName,
        target: targetDir(server.software) as 'plugins' | 'mods',
      });
    } catch (error) {
      throw new ApiError(
        `The node could not download the file: ${error instanceof Error ? error.message : 'unknown error'}`,
        502
      );
    }

    const db = getDb();
    db.prepare('DELETE FROM server_plugins WHERE server_id = ? AND project_id = ?').run(id, projectId);
    db.prepare(
      `INSERT INTO server_plugins (id, server_id, project_id, name, version, file_name, target, installed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomId('plg'),
      id,
      projectId,
      resolved.name,
      resolved.versionNumber,
      resolved.fileName,
      targetDir(server.software),
      user.id
    );

    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      serverId: id,
      action: 'plugin.installed',
      detail: `${resolved.name} ${resolved.versionNumber}`,
      ip: getClientIp(request),
    });

    return json({ ok: true, plugin: resolved });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const pluginId = new URL(request.url).searchParams.get('pluginId');
    if (!pluginId) throw new ApiError('pluginId is required', 400);

    const db = getDb();
    const row = db
      .prepare('SELECT * FROM server_plugins WHERE id = ? AND server_id = ?')
      .get(pluginId, id) as ServerPluginRow | undefined;
    if (!row) throw new ApiError('That plugin is not installed on this server.', 404);

    const provider = await providerFor(server);
    await provider.deletePaths(server, `/${row.target}`, [row.file_name]);
    db.prepare('DELETE FROM server_plugins WHERE id = ?').run(pluginId);

    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      serverId: id,
      action: 'plugin.removed',
      detail: row.name,
      ip: getClientIp(request),
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
