import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { errorResponse, json } from '@/lib/api';
import { platformStatus } from '@/lib/providers';

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspended_users,
           (SELECT COUNT(*) FROM servers) AS servers,
           (SELECT COUNT(*) FROM servers WHERE status = 'running') AS running_servers,
           (SELECT COUNT(*) FROM servers WHERE status = 'suspended') AS suspended_servers,
           (SELECT COUNT(*) FROM plans WHERE active = 1) AS plans,
           (SELECT COUNT(*) FROM nodes WHERE active = 1) AS nodes`
      )
      .get();

    const resource = db
      .prepare(
        `SELECT COALESCE(SUM(ram_mb), 0) AS ram, COALESCE(SUM(storage_mb), 0) AS storage, COALESCE(SUM(cpu_percent), 0) AS cpu FROM servers`
      )
      .get();

    const recentServers = db
      .prepare(
        `SELECT s.*, u.email AS owner_email FROM servers s JOIN users u ON u.id = s.owner_id
         ORDER BY s.created_at DESC LIMIT 8`
      )
      .all();

    const activity = db
      .prepare(
        `SELECT a.*, u.email AS actor_email, s.name AS server_name FROM activity a
         LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN servers s ON s.id = a.server_id
         ORDER BY a.created_at DESC LIMIT 30`
      )
      .all();

    const signups = db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM users
         WHERE created_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day ASC`
      )
      .all();

    return json({ counts, resource, recentServers, activity, signups, platform: await platformStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}
