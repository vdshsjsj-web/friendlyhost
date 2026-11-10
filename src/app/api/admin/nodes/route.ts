import { z } from 'zod';
import { getDb, type NodeRow } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { randomId, encryptSecret } from '@/lib/crypto.mjs';
import { createPterodactyl } from '@/lib/pterodactyl.mjs';

const nodeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  provider: z.enum(['local', 'pterodactyl']),
  location: z.string().trim().max(40).default('auto'),
  apiUrl: z.string().trim().url().optional().or(z.literal('')),
  apiKey: z.string().trim().max(300).optional().or(z.literal('')),
  clientKey: z.string().trim().max(300).optional().or(z.literal('')),
  pterodactylNodeId: z.number().int().min(1).optional(),
  nestId: z.number().int().min(1).optional(),
  eggId: z.number().int().min(1).optional(),
  capacityRamMb: z.number().int().min(0).max(10_000_000).default(0),
  capacityStorageMb: z.number().int().min(0).max(100_000_000).default(0),
  active: z.boolean().default(true),
});

function publicNode(node: NodeRow) {
  return {
    id: node.id,
    name: node.name,
    provider: node.provider,
    location: node.location,
    apiUrl: node.api_url,
    hasApiKey: Boolean(node.api_key_enc),
    hasClientKey: Boolean(node.client_key_enc),
    pterodactylNodeId: node.pterodactyl_node_id,
    nestId: node.nest_id,
    eggId: node.egg_id,
    capacityRamMb: node.capacity_ram_mb,
    capacityStorageMb: node.capacity_storage_mb,
    active: Boolean(node.active),
    status: node.status,
    statusMessage: node.status_message,
    lastCheckedAt: node.last_checked_at,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const nodes = db.prepare('SELECT * FROM nodes ORDER BY created_at ASC').all() as NodeRow[];
    const usage = db
      .prepare(
        `SELECT node_id, COUNT(*) AS servers, COALESCE(SUM(ram_mb), 0) AS ram_used, COALESCE(SUM(storage_mb), 0) AS storage_used
         FROM servers GROUP BY node_id`
      )
      .all() as { node_id: string; servers: number; ram_used: number; storage_used: number }[];
    return json({ nodes: nodes.map(publicNode), usage });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = nodeSchema.parse(await readJson(request));
    const db = getDb();
    const id = randomId('node');
    db.prepare(
      `INSERT INTO nodes (id, name, provider, location, api_url, api_key_enc, client_key_enc, pterodactyl_node_id,
        nest_id, egg_id, capacity_ram_mb, capacity_storage_mb, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
    ).run(
      id,
      input.name,
      input.provider,
      input.location,
      input.apiUrl || null,
      input.apiKey ? encryptSecret(input.apiKey) : null,
      input.clientKey ? encryptSecret(input.clientKey) : null,
      input.pterodactylNodeId ?? null,
      input.nestId ?? null,
      input.eggId ?? null,
      input.capacityRamMb,
      input.capacityStorageMb,
      input.active ? 1 : 0
    );
    logActivity({ actorId: admin.id, action: 'admin.node.created', detail: input.name, ip: getClientIp(request) });
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow;
    return json({ node: publicNode(node) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = nodeSchema.partial().extend({
  id: z.string().min(3),
  action: z.enum(['test']).optional(),
});

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = patchSchema.parse(await readJson(request));
    const db = getDb();
    const existing = db.prepare('SELECT * FROM nodes WHERE id = ?').get(body.id) as NodeRow | undefined;
    if (!existing) throw new ApiError('Node not found.', 404);

    db.prepare(
      `UPDATE nodes SET name = ?, location = ?, api_url = ?, active = ?,
        capacity_ram_mb = ?, capacity_storage_mb = ?, pterodactyl_node_id = ?, nest_id = ?, egg_id = ?,
        api_key_enc = CASE WHEN ? THEN ? ELSE api_key_enc END,
        client_key_enc = CASE WHEN ? THEN ? ELSE client_key_enc END,
        updated_at = datetime('now') WHERE id = ?`
    ).run(
      body.name ?? existing.name,
      body.location ?? existing.location,
      body.apiUrl ?? existing.api_url,
      body.active === undefined ? existing.active : body.active ? 1 : 0,
      body.capacityRamMb ?? existing.capacity_ram_mb,
      body.capacityStorageMb ?? existing.capacity_storage_mb,
      body.pterodactylNodeId ?? existing.pterodactyl_node_id,
      body.nestId ?? existing.nest_id,
      body.eggId ?? existing.egg_id,
      body.apiKey ? 1 : 0,
      body.apiKey ? encryptSecret(body.apiKey) : null,
      body.clientKey ? 1 : 0,
      body.clientKey ? encryptSecret(body.clientKey) : null,
      body.id
    );

    if (body.action === 'test') {
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(body.id) as NodeRow;
      if (node.provider === 'local') {
        const { localRuntime } = await import('@/lib/providers');
        const rt = await localRuntime();
        const java = await rt.javaAvailable();
        const status = java.available ? 'online' : 'error';
        db.prepare(
          `UPDATE nodes SET status = ?, status_message = ?, last_checked_at = datetime('now') WHERE id = ?`
        ).run(status, java.available ? `Java ${java.version} detected` : java.message, node.id);
        const updated = db.prepare('SELECT * FROM nodes WHERE id = ?').get(node.id) as NodeRow;
        return json({ node: publicNode(updated) });
      }

      const client = createPterodactyl({
        url: node.api_url ?? '',
        applicationKey: node.api_key_enc ? decrypt(node.api_key_enc) : '',
        clientKey: node.client_key_enc ? decrypt(node.client_key_enc) : '',
      });
      const result = await client.testConnection();
      db.prepare(
        `UPDATE nodes SET status = ?, status_message = ?, last_checked_at = datetime('now') WHERE id = ?`
      ).run(
        result.ok ? 'online' : 'error',
        result.checks.map((c: { label: string; ok: boolean; detail?: string }) => `${c.label}: ${c.ok ? 'ok' : c.detail ?? 'failed'}`).join(' · '),
        node.id
      );
      const updated = db.prepare('SELECT * FROM nodes WHERE id = ?').get(node.id) as NodeRow;
      return json({ node: publicNode(updated), checks: result.checks });
    }

    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(body.id) as NodeRow;
    return json({ node: publicNode(node) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError('id is required', 400);
    const db = getDb();
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    if (!node) throw new ApiError('Node not found.', 404);
    const used = db.prepare('SELECT COUNT(*) AS n FROM servers WHERE node_id = ?').get(id) as { n: number };
    if (used.n > 0) throw new ApiError('Move or delete the servers on this node first.', 409);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    logActivity({ actorId: admin.id, action: 'admin.node.deleted', detail: node.name, ip: getClientIp(request) });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function decrypt(value: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { decryptSecret } = require('@/lib/crypto.mjs');
  return decryptSecret(value);
}
