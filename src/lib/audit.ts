import { getDb, type ActivityRow } from './db';
import { randomId } from './crypto.mjs';

export function logActivity(entry: {
  actorId?: string | null;
  userId?: string | null;
  serverId?: string | null;
  action: string;
  detail?: string;
  ip?: string | null;
}) {
  try {
    getDb()
      .prepare(
        `INSERT INTO activity (id, actor_id, user_id, server_id, action, detail, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomId('act'),
        entry.actorId ?? null,
        entry.userId ?? entry.actorId ?? null,
        entry.serverId ?? null,
        entry.action,
        entry.detail ?? '',
        entry.ip ?? null
      );
  } catch (error) {
    console.error('[activity] failed to record', error);
  }
}

export type ActivityWithNames = ActivityRow & {
  actor_name: string | null;
  user_name: string | null;
  server_name: string | null;
};

export function listActivity({
  userId,
  serverId,
  limit = 50,
  offset = 0,
}: { userId?: string; serverId?: string; limit?: number; offset?: number } = {}): ActivityWithNames[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (userId) {
    clauses.push('a.user_id = ?');
    params.push(userId);
  }
  if (serverId) {
    clauses.push('a.server_id = ?');
    params.push(serverId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT a.*, actor.name AS actor_name, target.name AS user_name, s.name AS server_name
       FROM activity a
       LEFT JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users target ON target.id = a.user_id
       LEFT JOIN servers s ON s.id = a.server_id
       ${where}
       ORDER BY a.created_at DESC, a.rowid DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ActivityWithNames[];
}
