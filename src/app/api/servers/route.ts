import { z } from 'zod';
import { getDb, type NodeRow, type PlanRow, type ServerRow } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { randomId } from '@/lib/crypto.mjs';
import { allocatePort, chooseNode, provisionServer, publicHost } from '@/lib/providers';
import { isValidVersion, type SoftwareId } from '@/lib/minecraft';

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Server name needs at least 3 characters')
    .max(40, 'Keep the name under 40 characters')
    .regex(/^[A-Za-z0-9 _.-]+$/, 'Use letters, numbers, spaces, dashes or dots'),
  software: z.enum(['paper', 'purpur', 'vanilla', 'fabric', 'forge']).default('paper'),
  edition: z.enum(['java', 'bedrock']).default('java'),
  version: z.string().trim().min(1).max(30),
  planId: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  motd: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const scopeAll = url.searchParams.get('scope') === 'all' && user.role === 'admin';

    const rows = getDb()
      .prepare(
        `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug, n.name AS node_name, n.provider AS node_provider
         FROM servers s
         LEFT JOIN plans p ON p.id = s.plan_id
         LEFT JOIN nodes n ON n.id = s.node_id
         ${scopeAll ? '' : 'WHERE s.owner_id = ?'}
         ORDER BY s.created_at DESC`
      )
      .all(...(scopeAll ? [] : [user.id])) as (ServerRow & {
      plan_name: string | null;
      plan_slug: string | null;
      node_name: string | null;
      node_provider: string | null;
    })[];

    const players = new Map<string, number>();
    for (const row of rows) {
      const count = getDb()
        .prepare(`SELECT COUNT(*) AS c FROM activity WHERE server_id = ? AND action = 'server.player_join'`)
        .get(row.id) as { c: number };
      players.set(row.id, count.c);
    }

    return json({ servers: rows, viewerId: user.id, isAdmin: user.role === 'admin' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const ip = getClientIp(request);
    assertRateLimit(`create-server:${user.id}`, 6, 60_000);

    const input = createSchema.parse(await readJson(request));
    const db = getDb();

    const plan = db
      .prepare('SELECT * FROM plans WHERE id = ? AND active = 1')
      .get(input.planId ?? user.plan_id ?? '') as PlanRow | undefined;
    if (!plan) throw new ApiError('Pick a hosting plan before creating a server.', 400);
    if (input.planId && input.planId !== user.plan_id && user.role !== 'admin') {
      throw new ApiError('That plan is not attached to your account. Upgrade from the dashboard first.', 403);
    }

    const owned = db
      .prepare(`SELECT COUNT(*) AS total FROM servers WHERE owner_id = ? AND status != 'error'`)
      .get(user.id) as { total: number };
    if (owned.total >= plan.max_servers) {
      throw new ApiError(
        `The ${plan.name} plan allows ${plan.max_servers} server${plan.max_servers === 1 ? '' : 's'}. Delete a server or upgrade to add another.`,
        409
      );
    }

    const edition = input.edition;
    const software: SoftwareId = edition === 'bedrock' ? 'vanilla' : input.software;
    const version = edition === 'bedrock' ? 'latest' : input.version;

    if (!(await isValidVersion(software, version, edition))) {
      throw new ApiError(
        edition === 'bedrock'
          ? 'Bedrock servers track the latest Bedrock release automatically.'
          : `${software} has no build for Minecraft ${version}. Pick another version.`,
        422
      );
    }

    const node: NodeRow = chooseNode(plan, input.nodeId ?? null);
    const port = await allocatePort(edition);
    const serverId = randomId('srv');

    db.prepare(
      `INSERT INTO servers (id, owner_id, node_id, plan_id, name, software, version, edition,
        ram_mb, cpu_percent, storage_mb, status, ip, port, motd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provisioning', ?, ?, ?)`
    ).run(
      serverId,
      user.id,
      node.id,
      plan.id,
      input.name,
      software,
      version,
      edition,
      plan.ram_mb,
      plan.cpu_percent,
      plan.storage_mb,
      publicHost(),
      port,
      input.motd || `${input.name} - powered by Jasfer Hosting`
    );

    logActivity({
      actorId: user.id,
      userId: user.id,
      serverId,
      action: 'server.created',
      detail: `${input.name} (${edition === 'bedrock' ? 'Bedrock' : software} ${version}) on ${node.name}`,
      ip,
    });

    // Real provisioning runs in the background on the node; the row stays
    // "provisioning" until the node confirms it exists.
    void provisionServer(serverId).catch((error) => console.error('[provision]', error));

    const created = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerRow;
    return json({ server: created, node: { id: node.id, name: node.name, provider: node.provider } }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
