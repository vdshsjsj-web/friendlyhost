# Jasfer Hosting — database schema

SQLite, applied idempotently by `npm run migrate` and on boot. Full DDL lives in
[`src/lib/schema.sql`](../src/lib/schema.sql); this is the map.

```
users ─┬─< sessions
       ├─< servers ─┬─< server_plugins
       │            └──> nodes (node_id)
       ├─< activity
       └──> plans (plan_id)

nodes ──< servers
plans ──< users, servers
```

## Tables

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | `usr_…` |
| `email` | TEXT UNIQUE | lowercased |
| `name` | TEXT | display name |
| `password_hash` | TEXT NULL | scrypt; null for Google-only accounts |
| `google_id` | TEXT NULL | Google subject id |
| `avatar_url` | TEXT NULL | from Google |
| `role` | TEXT | `user` \| `admin` |
| `status` | TEXT | `active` \| `suspended` |
| `plan_id` | TEXT → plans | resource limits |
| `created_at`, `updated_at`, `last_login_at` | TEXT | ISO timestamps |

### `sessions`
`id`, `user_id` → users (cascade), `token_hash` (the raw token is only in the cookie), `user_agent`, `ip`,
`created_at`, `expires_at`. Sessions are deleted on logout and on password change.

### `oauth_states`
Short-lived CSRF state for the Google flow: `state`, `created_at`, `expires_at`.

### `plans`
`id`, `slug` UNIQUE, `name`, `description`, `price_cents`, `currency`, `ram_mb`, `cpu_percent`,
`storage_mb`, `max_servers`, `is_free`, `features` (JSON array), `sort_order`, `active`,
timestamps. `active = 0` hides a plan from the public list without deleting history.

### `nodes`
Where processes run.

| Column | Notes |
| --- | --- |
| `id` | `nod_…` |
| `name`, `location` | labels |
| `provider` | `local` \| `pterodactyl` |
| `api_url` | panel base URL |
| `api_key_enc`, `client_key_enc` | AES-256-GCM ciphertext, never returned to clients |
| `pterodactyl_node_id`, `nest_id`, `egg_id` | panel placement |
| `capacity_ram_mb`, `capacity_storage_mb` | allocation ceiling (`0` = unlimited) |
| `status`, `status_message`, `last_checked_at` | result of the last real connection test |
| `active` | whether new servers may be placed here |

### `servers`
`id`, `owner_id` → users, `node_id` → nodes, `name`, `software` (`paper|purpur|vanilla|fabric|forge`),
`version`, `edition` (`java|bedrock`), `status` (`provisioning|stopped|starting|running|stopping|error|suspended`),
`status_message`, `ip`, `port`, `motd`, `ram_mb`, `cpu_percent`, `storage_mb`, `provider_server_id`
(panel id), `directory`, `created_at`, `updated_at`, `last_started_at`.

### `server_plugins`
`id`, `server_id` → servers (cascade), `project_id` (Modrinth), `name`, `version`, `source`, `file_name`,
`target` (`plugins` \| `mods`), `installed_by` → users, `installed_at`.

### `activity`
Append-only audit trail: `id`, `actor_id`, `user_id` (whose resources were touched), `server_id`,
`action` (`auth.login`, `server.start`, `plugin.installed`, `admin.user.suspended`, …), `detail`, `ip`,
`created_at`.

### `settings`
Key/value store: `schema_version`, seed markers.

## Indexes

`users(email)`, `sessions(token_hash)`, `sessions(user_id)`, `servers(owner_id)`, `servers(node_id)`,
`server_plugins(server_id)`, `activity(created_at)`, `activity(server_id)`.

## Migrations

`scripts/migrate.mjs` applies the schema, then runs additive column migrations for databases created
before a column existed (for example `server_plugins.target`). Both steps are safe to run repeatedly and
on every boot.

## Backups

```bash
sqlite3 data/jasfer.db ".backup 'backup-$(date +%F).db'"
tar -czf servers-$(date +%F).tar.gz data/servers
```

The database is WAL-mode; copy with `.backup` (or stop the panel) rather than `cp` while it is running.
