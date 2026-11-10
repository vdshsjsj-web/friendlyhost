import { z } from 'zod';
import { getDb, type PlanRow } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { randomId } from '@/lib/crypto.mjs';

const planSchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  description: z.string().trim().max(200).default(''),
  priceCents: z.number().int().min(0).max(1_000_000).default(0),
  ramMb: z.number().int().min(256).max(131_072),
  cpuPercent: z.number().int().min(10).max(1600).default(100),
  storageMb: z.number().int().min(512).max(1_048_576),
  maxServers: z.number().int().min(1).max(100).default(1),
  isFree: z.boolean().default(false),
  features: z.array(z.string().trim().max(80)).max(12).default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const plans = getDb().prepare('SELECT * FROM plans ORDER BY sort_order ASC').all() as PlanRow[];
    return json({ plans: plans.map((p) => ({ ...p, features: JSON.parse(p.features || '[]') })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = planSchema.parse(await readJson(request));
    const db = getDb();
    if (db.prepare('SELECT id FROM plans WHERE slug = ?').get(input.slug)) {
      throw new ApiError('A plan with that slug already exists.', 409);
    }
    const id = randomId('plan');
    db.prepare(
      `INSERT INTO plans (id, slug, name, description, price_cents, ram_mb, cpu_percent, storage_mb, max_servers, is_free, features, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.slug,
      input.name,
      input.description,
      input.priceCents,
      input.ramMb,
      input.cpuPercent,
      input.storageMb,
      input.maxServers,
      input.isFree ? 1 : 0,
      JSON.stringify(input.features),
      input.sortOrder,
      input.active ? 1 : 0
    );
    logActivity({ actorId: admin.id, action: 'admin.plan.created', detail: input.name, ip: getClientIp(request) });
    return json({ plan: db.prepare('SELECT * FROM plans WHERE id = ?').get(id) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = planSchema.partial().extend({ id: z.string().min(3) });

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = patchSchema.parse(await readJson(request));
    const db = getDb();
    const existing = db.prepare('SELECT * FROM plans WHERE id = ?').get(body.id) as PlanRow | undefined;
    if (!existing) throw new ApiError('Plan not found.', 404);

    db.prepare(
      `UPDATE plans SET name = ?, slug = ?, description = ?, price_cents = ?, ram_mb = ?, cpu_percent = ?,
         storage_mb = ?, max_servers = ?, is_free = ?, features = ?, sort_order = ?, active = ?,
         updated_at = datetime('now') WHERE id = ?`
    ).run(
      body.name ?? existing.name,
      body.slug ?? existing.slug,
      body.description ?? existing.description,
      body.priceCents ?? existing.price_cents,
      body.ramMb ?? existing.ram_mb,
      body.cpuPercent ?? existing.cpu_percent,
      body.storageMb ?? existing.storage_mb,
      body.maxServers ?? existing.max_servers,
      body.isFree === undefined ? existing.is_free : body.isFree ? 1 : 0,
      body.features ? JSON.stringify(body.features) : existing.features,
      body.sortOrder ?? existing.sort_order,
      body.active === undefined ? existing.active : body.active ? 1 : 0,
      body.id
    );
    logActivity({ actorId: admin.id, action: 'admin.plan.updated', detail: existing.name, ip: getClientIp(request) });
    return json({ plan: db.prepare('SELECT * FROM plans WHERE id = ?').get(body.id) });
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
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined;
    if (!plan) throw new ApiError('Plan not found.', 404);

    const inUse = db.prepare('SELECT COUNT(*) AS n FROM servers WHERE plan_id = ?').get(id) as { n: number };
    if (inUse.n > 0) {
      db.prepare('UPDATE plans SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
      return json({ ok: true, archived: true, message: 'Plan is in use, so it was archived instead of deleted.' });
    }
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    logActivity({ actorId: admin.id, action: 'admin.plan.deleted', detail: plan.name, ip: getClientIp(request) });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
