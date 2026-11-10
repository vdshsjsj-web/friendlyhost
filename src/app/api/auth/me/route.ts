import { getCurrentUser, publicUser } from '@/lib/auth';
import { getDb, type PlanRow } from '@/lib/db';
import { errorResponse, json } from '@/lib/api';
import { config } from '@/lib/config';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return json({ user: null, googleEnabled: Boolean(config.google.clientId && config.google.clientSecret) });
    }
    const db = getDb();
    const plan = user.plan_id
      ? ((db.prepare('SELECT * FROM plans WHERE id = ?').get(user.plan_id) as PlanRow | undefined) ?? null)
      : null;
    const servers = db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(ram_mb), 0) AS ram
         FROM servers WHERE owner_id = ? AND status != 'error'`
      )
      .get(user.id) as { total: number; ram: number };

    return json({
      user: publicUser(user),
      plan,
      usage: { servers: servers.total, ramMb: servers.ram },
      googleEnabled: Boolean(config.google.clientId && config.google.clientSecret),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
