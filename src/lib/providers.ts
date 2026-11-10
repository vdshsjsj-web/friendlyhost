import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, type NodeRow, type PlanRow, type ServerRow } from './db';
import { config } from './config';
import { ApiError } from './api';
import { decryptSecret } from './crypto.mjs';
import type { SoftwareId } from './minecraft';

/**
 * Provider facade.
 *
 * The local runtime and the Pterodactyl client are plain ESM modules imported
 * at runtime through one absolute file URL, so the WebSocket relay in
 * server.js and the API routes share the exact same process registry.
 */
const moduleCache = new Map<string, any>();

export async function loadModule<T = any>(file: string): Promise<T> {
  const cached = moduleCache.get(file);
  if (cached) return cached;
  const url = pathToFileURL(path.join(process.cwd(), 'src/lib', file)).href;
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
  moduleCache.set(file, mod);
  return mod as T;
}

export const localRuntime = () => loadModule('local-runtime.mjs');
export const pterodactylModule = () => loadModule('pterodactyl.mjs');

export function getNode(nodeId: string | null): NodeRow | null {
  if (!nodeId) return null;
  return (getDb().prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId) as NodeRow) ?? null;
}

export function listNodes(): NodeRow[] {
  return getDb().prepare('SELECT * FROM nodes ORDER BY created_at ASC').all() as NodeRow[];
}

export function activeNodes(): NodeRow[] {
  return listNodes().filter((n) => n.active);
}

export function nodeCredentials(node: NodeRow) {
  return {
    url: node.api_url ?? '',
    applicationKey: decryptSecret(node.api_key_enc) ?? '',
    clientKey: decryptSecret(node.client_key_enc) ?? '',
  };
}

export async function pterodactylFor(node: NodeRow) {
  const creds = nodeCredentials(node);
  const mod = await pterodactylModule();
  return mod.createPterodactyl({
    url: creds.url,
    applicationKey: creds.applicationKey,
    clientKey: creds.clientKey,
  });
}

export function nodeIsConfigured(node: NodeRow): boolean {
  if (node.provider === 'local') return config.localProviderEnabled;
  const creds = nodeCredentials(node);
  return Boolean(creds.url && creds.applicationKey && creds.clientKey);
}

export function usedCapacity(nodeId: string): { ramMb: number; storageMb: number; servers: number } {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(ram_mb), 0) AS ram, COALESCE(SUM(storage_mb), 0) AS storage, COUNT(*) AS count
       FROM servers WHERE node_id = ? AND status NOT IN ('error')`
    )
    .get(nodeId) as { ram: number; storage: number; count: number };
  return { ramMb: row.ram, storageMb: row.storage, servers: row.count };
}

export function nodeFreeCapacity(node: NodeRow) {
  const used = usedCapacity(node.id);
  return {
    freeRamMb: node.capacity_ram_mb > 0 ? Math.max(0, node.capacity_ram_mb - used.ramMb) : null,
    freeStorageMb: node.capacity_storage_mb > 0 ? Math.max(0, node.capacity_storage_mb - used.storageMb) : null,
    used,
  };
}

/**
 * Chooses a node that can really host the requested resources.
 * Throws a setup-oriented error when nothing is connected.
 */
export function chooseNode(plan: PlanRow, preferredNodeId?: string | null): NodeRow {
  const nodes = activeNodes();
  if (!nodes.length) {
    throw new ApiError(
      'No hosting infrastructure is connected yet. Open Infrastructure setup to connect a node, then create your server.',
      409,
      { code: 'no_nodes' }
    );
  }
  const configured = nodes.filter(nodeIsConfigured);
  if (!configured.length) {
    throw new ApiError(
      'A node is registered but its credentials are missing. Finish the infrastructure setup before creating servers.',
      409,
      { code: 'node_unconfigured' }
    );
  }
  const ordered = preferredNodeId
    ? [...configured].sort((a, b) => (a.id === preferredNodeId ? -1 : b.id === preferredNodeId ? 1 : 0))
    : configured;

  for (const node of ordered) {
    const { freeRamMb, freeStorageMb } = nodeFreeCapacity(node);
    const ramOk = freeRamMb === null || freeRamMb >= plan.ram_mb;
    const storageOk = freeStorageMb === null || freeStorageMb >= plan.storage_mb;
    if (ramOk && storageOk) return node;
  }
  const detail = ordered
    .map((n) => {
      const free = nodeFreeCapacity(n);
      return `${n.name}: ${free.freeRamMb ?? '∞'} MB RAM free`;
    })
    .join(', ');
  throw new ApiError(
    `None of the connected nodes has enough free capacity for this plan (${plan.ram_mb} MB RAM). ${detail}`,
    409,
    { code: 'insufficient_capacity' }
  );
}

export async function allocatePort(edition: 'java' | 'bedrock'): Promise<number> {
  const db = getDb();
  const taken = new Set(
    (db.prepare('SELECT port FROM servers WHERE port IS NOT NULL').all() as { port: number }[]).map((r) => r.port)
  );
  const start = edition === 'bedrock' ? 19132 : 25565;
  for (let port = start; port < start + 400; port += 1) {
    if (taken.has(port)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '0.0.0.0');
    });
    if (free) return port;
  }
  throw new ApiError('No free ports are available on this node.', 409);
}

export function publicHost(): string {
  try {
    return new URL(config.appUrl).hostname;
  } catch {
    return 'localhost';
  }
}

export function serverDirectory(serverId: string) {
  return path.join(config.serversDir, serverId);
}

export function safeServerPath(serverId: string, relative: string): string {
  const root = path.resolve(serverDirectory(serverId));
  const clean = (relative || '/').replace(/\\/g, '/');
  const target = path.resolve(root, `.${clean.startsWith('/') ? clean : `/${clean}`}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new ApiError('That path is outside this server directory.', 400);
  }
  return target;
}

export type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  modifiedAt: string | null;
};

async function localListFiles(serverId: string, directory: string): Promise<FileEntry[]> {
  const dir = safeServerPath(serverId, directory);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    throw new ApiError('That folder does not exist on the node yet.', 404);
  }
  const base = directory === '/' ? '' : directory.replace(/\/$/, '');
  const mapped = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      let size = 0;
      let modifiedAt: string | null = null;
      try {
        const stat = await fs.stat(full);
        size = stat.size;
        modifiedAt = stat.mtime.toISOString();
      } catch {
        /* ignore */
      }
      return {
        name: entry.name,
        path: `${base}/${entry.name}`,
        type: entry.isDirectory() ? ('dir' as const) : ('file' as const),
        size,
        modifiedAt,
      };
    })
  );
  return mapped.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

export type ProviderHandle = {
  kind: 'local' | 'pterodactyl';
  status: (server: ServerRow) => Promise<any>;
  power: (server: ServerRow, action: 'start' | 'stop' | 'restart' | 'kill') => Promise<any>;
  consoleHistory: (server: ServerRow) => Promise<string[]>;
  listFiles: (server: ServerRow, directory: string) => Promise<FileEntry[]>;
  readFile: (server: ServerRow, file: string) => Promise<string>;
  writeFile: (server: ServerRow, file: string, content: string) => Promise<void>;
  deletePaths: (server: ServerRow, directory: string, names: string[]) => Promise<void>;
  renamePath: (server: ServerRow, directory: string, from: string, to: string) => Promise<void>;
  makeFolder: (server: ServerRow, directory: string, name: string) => Promise<void>;
  installPlugin: (server: ServerRow, opts: { url: string; fileName: string; target: 'plugins' | 'mods' }) => Promise<void>;
};

export async function providerFor(server: ServerRow): Promise<ProviderHandle> {
  const node = getNode(server.node_id);
  if (!node) {
    throw new ApiError('This server is not attached to a node anymore. Reconnect a node in the admin dashboard.', 409);
  }
  if (!nodeIsConfigured(node)) {
    throw new ApiError(`Node "${node.name}" is missing its credentials. Complete the infrastructure setup first.`, 409);
  }

  if (node.provider === 'local') {
    const rt = await localRuntime();
    return {
      kind: 'local',
      status: async (srv) => {
        const result = await rt.status(srv.id);
        return result;
      },
      power: async (srv, action) => {
        if (action === 'start') return rt.start(srv.id);
        if (action === 'stop') return rt.stop(srv.id, { force: false });
        if (action === 'kill') return rt.stop(srv.id, { force: true });
        if (action === 'restart') return rt.restart(srv.id);
        throw new ApiError(`Unknown power action: ${action}`, 400);
      },
      consoleHistory: async (srv) => rt.consoleHistory(srv.id),
      listFiles: async (srv, directory) => localListFiles(srv.id, directory),
      readFile: async (srv, file) => {
        const target = safeServerPath(srv.id, file);
        const stat = await fs.stat(target).catch(() => null);
        if (!stat || !stat.isFile()) throw new ApiError('File not found.', 404);
        if (stat.size > 512000) throw new ApiError('This file is larger than the 500 KB editor limit.', 413);
        return fs.readFile(target, 'utf8');
      },
      writeFile: async (srv, file, content) => {
        const target = safeServerPath(srv.id, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, 'utf8');
      },
      deletePaths: async (srv, directory, names) => {
        for (const name of names) {
          const target = safeServerPath(srv.id, `${directory.replace(/\/$/, '')}/${name}`);
          if (target === safeServerPath(srv.id, '/')) throw new ApiError('Refusing to delete the server root.', 400);
          await fs.rm(target, { recursive: true, force: true });
        }
      },
      renamePath: async (srv, directory, from, to) => {
        const base = directory.replace(/\/$/, '');
        await fs.rename(safeServerPath(srv.id, `${base}/${from}`), safeServerPath(srv.id, `${base}/${to}`));
      },
      makeFolder: async (srv, directory, name) => {
        await fs.mkdir(safeServerPath(srv.id, `${directory.replace(/\/$/, '')}/${name}`), { recursive: true });
      },
      installPlugin: async (srv, { url, fileName, target }) => {
        const downloads = await loadModule('downloads.mjs');
        const dir = safeServerPath(srv.id, `/${target}`);
        await fs.mkdir(dir, { recursive: true });
        await downloads.downloadTo(url, path.join(dir, fileName));
      },
    };
  }

  const client = await pterodactylFor(node);
  const providerId = (srv: ServerRow) => {
    if (!srv.provider_server_id) throw new ApiError('This server has no panel identifier yet.', 409);
    return srv.provider_server_id;
  };
  return {
    kind: 'pterodactyl',
    status: async (srv) => client.resources(providerId(srv)),
    power: async (srv, action) => client.power(providerId(srv), action),
    consoleHistory: async () => [],
    listFiles: async (srv, directory) => client.listFiles(providerId(srv), directory),
    readFile: async (srv, file) => client.readFile(providerId(srv), file),
    writeFile: async (srv, file, content) => {
      await client.writeFile(providerId(srv), file, content);
    },
    deletePaths: async (srv, directory, names) => {
      await client.deleteFiles(providerId(srv), directory, names);
    },
    renamePath: async (srv, directory, from, to) => {
      await client.renameFile(providerId(srv), directory, from, to);
    },
    makeFolder: async (srv, directory, name) => {
      await client.createFolder(providerId(srv), directory, name);
    },
    installPlugin: async (srv, { url, fileName, target }) => {
      // Pterodactyl pulls the file itself, so large jars never pass through us.
      await client.pullFile(providerId(srv), url, `/${target}`);
      void fileName;
    },
  };
}

/** Mirrors live provider state into the servers table. */
export async function syncServerStatus(server: ServerRow): Promise<ServerRow> {
  if (server.status === 'provisioning' || server.status === 'suspended') return server;
  try {
    const provider = await providerFor(server);
    const live = await provider.status(server);
    const nextStatus = live.state as ServerRow['status'];
    getDb()
      .prepare(
        `UPDATE servers SET status = ?, status_message = ?, last_status_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(nextStatus, live.message ?? null, server.id);
    return { ...server, status: nextStatus, status_message: live.message ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider unreachable';
    getDb()
      .prepare(
        `UPDATE servers SET status = 'error', status_message = ?, last_status_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(message, server.id);
    return { ...server, status: 'error', status_message: message };
  }
}

export type ProvisionInput = {
  serverId: string;
  name: string;
  software: SoftwareId;
  version: string;
  edition: 'java' | 'bedrock';
  ramMb: number;
  cpuPercent: number;
  storageMb: number;
  port: number;
  motd: string;
};

/** Runs in the background after the API returns; updates the row when done. */
export async function provisionServer(serverId: string): Promise<void> {
  const db = getDb();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerRow | undefined;
  if (!server) return;
  const node = getNode(server.node_id);
  if (!node) return;

  try {
    if (node.provider === 'local') {
      const rt = await localRuntime();
      await rt.provision({
        serverId: server.id,
        name: server.name,
        software: server.software,
        version: server.version,
        edition: server.edition,
        ramMb: server.ram_mb,
        port: server.port,
        motd: server.motd,
        maxPlayers: 20,
      });
      db.prepare(
        `UPDATE servers SET status = 'offline', provider_server_id = ?, ip = ?, status_message = NULL,
         updated_at = datetime('now'), last_status_at = datetime('now') WHERE id = ?`
      ).run(server.id, server.id, server.ip ?? publicHost(), server.id);
    } else {
      const client = await pterodactylFor(node);
      const created = await client.createServer({
        name: server.name,
        ramMb: server.ram_mb,
        cpuPercent: server.cpu_percent,
        storageMb: server.storage_mb,
        nodeId: node.pterodactyl_node_id ?? 1,
        nestId: node.nest_id ?? 1,
        eggId: node.egg_id ?? 1,
        port: server.port ?? undefined,
        environment: {
          VANILLA_VERSION: server.version,
          SERVER_JARFILE: 'server.jar',
          JASFER_EDITION: server.edition,
          JASFER_SOFTWARE: server.software,
        },
      });
      db.prepare(
        `UPDATE servers SET status = 'offline', provider_server_id = ?, ip = ?, port = ?, status_message = NULL,
         updated_at = datetime('now'), last_status_at = datetime('now') WHERE id = ?`
      ).run(created.providerServerId, created.ip, created.port, server.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed';
    db.prepare(
      `UPDATE servers SET status = 'error', status_message = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(message, server.id);
    console.error(`[provision] ${serverId} failed:`, message);
  }
}

export async function platformStatus() {
  const nodes = listNodes();
  const rt = config.localProviderEnabled ? await localRuntime() : null;
  const java = rt ? await rt.javaAvailable() : { available: false, version: null };
  const capacity = rt ? rt.capacity() : null;

  return {
    local: {
      enabled: config.localProviderEnabled,
      java,
      capacity,
      nodes: nodes.filter((n) => n.provider === 'local').length,
    },
    pterodactyl: {
      nodes: nodes.filter((n) => n.provider === 'pterodactyl').length,
      configured: nodes.filter((n) => n.provider === 'pterodactyl' && nodeIsConfigured(n)).length,
    },
    connected: nodes.some((n) => n.active && nodeIsConfigured(n)),
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      provider: n.provider,
      location: n.location,
      configured: nodeIsConfigured(n),
      active: Boolean(n.active),
      status: n.status,
      statusMessage: n.status_message,
      capacityRamMb: n.capacity_ram_mb,
      capacityStorageMb: n.capacity_storage_mb,
      used: usedCapacity(n.id),
    })),
  };
}
