import { z } from 'zod';
import { getDb, type UserRow } from '@/lib/db';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';

const patchSchema = z.object({
  userId: z.string().min(3),
  status: z.enum(['active', 'suspended']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  planId: z.string().nullable().optional(),
  password: z.string().min(8).max(200).optional(),
  name: z.string().trim().min(2).max(60).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const users = getDb()
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.status, u.plan_id, u.created_at, u.last_login_at,
                p.name AS plan_name,
                (SELECT COUNT(*) FROM servers s WHERE s.owner_id = u.id) AS server_count
         FROM users u LEFT JOIN plans p ON p.id = u.plan_id
         ORDER BY u.created_at DESC`
      )
      .all();
    return json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = patchSchema.parse(await readJson(request));
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(body.userId) as UserRow | undefined;
    if (!target) throw new ApiError('User not found.', 404);
    if (target.id === admin.id && (body.status === 'suspended' || body.role === 'user')) {
      throw new ApiError('You cannot suspend or demote the account you are signed in with.', 400);
    }

    if (body.planId) {
      const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(body.planId);
      if (!plan) throw new ApiError('That plan does not exist.', 400);
    }

    db.prepare(
      `UPDATE users SET
         status = COALESCE(?, status),
         role = COALESCE(?, role),
         plan_id = CASE WHEN ? THEN ? ELSE plan_id END,
         name = COALESCE(?, name),
         password_hash = COALESCE(?, password_hash),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.status ?? null,
      body.role ?? null,
      body.planId !== undefined ? 1 : 0,
      body.planId ?? null,
      body.name ?? null,
      body.password ? hashPassword(body.password) : null,
      body.userId
    );

    // Suspending an account also suspends its servers so nothing keeps running.
    if (body.status === 'suspended') {
      db.prepare("UPDATE servers SET status = 'suspended', updated_at = datetime('now') WHERE owner_id = ?").run(
        body.userId
      );
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(body.userId);
    }

    logActivity({
      actorId: admin.id,
      userId: body.userId,
      action: body.status ? `admin.user.${body.status}` : 'admin.user.updated',
      detail: `Admin updated ${target.email}`,
      ip: getClientIp(request),
    });

    const updated = db.prepare('SELECT id, email, name, role, status, plan_id FROM users WHERE id = ?').get(body.userId);
    return json({ user: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) throw new ApiError('userId is required', 400);
    if (userId === admin.id) throw new ApiError('You cannot delete your own account.', 400);

    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!target) throw new ApiError('User not found.', 404);

    const servers = db.prepare('SELECT id FROM servers WHERE owner_id = ?').all(userId) as { id: string }[];
    if (servers.length) {
      throw new ApiError(
        `This account still owns ${servers.length} server(s). Delete those servers first so their processes are stopped cleanly.`,
        409
      );
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logActivity({ actorId: admin.id, action: 'admin.user.deleted', detail: target.email, ip: getClientIp(request) });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
