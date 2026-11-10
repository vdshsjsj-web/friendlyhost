/**
 * Pterodactyl / Pelican compatible adapter.
 *
 * Uses two credentials, both kept server-side and encrypted at rest:
 *   - Application API key  -> provisioning, deletion, allocations
 *   - Client API key       -> power, files, console websocket, resources
 *
 * Nothing in this module is ever sent to the browser.
 */
import { WebSocket } from 'ws';

export class PterodactylError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'PterodactylError';
    this.status = status;
    this.body = body;
  }
}

export function createPterodactyl({ url, applicationKey, clientKey }) {
  if (!url) throw new Error('Pterodactyl panel URL is not configured');
  const base = url.replace(/\/$/, '');

  async function request(path, { key = clientKey, method = 'GET', body, timeout = 20000 } = {}) {
    if (!key) throw new PterodactylError('Missing API key for this Pterodactyl request', 401, null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'JasferHosting/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text.slice(0, 500) };
        }
      }
      if (!res.ok) {
        const message =
          parsed?.errors?.[0]?.detail ||
          parsed?.errors?.[0]?.code ||
          parsed?.error ||
          `Pterodactyl request failed (${res.status})`;
        throw new PterodactylError(message, res.status, parsed);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  const app = (path, opts = {}) => request(`/api/application${path}`, { ...opts, key: applicationKey });
  const client = (path, opts = {}) => request(`/api/client${path}`, { ...opts, key: clientKey });

  return {
    base,

    async testConnection() {
      const checks = [];
      try {
        const nodes = await app('/nodes');
        checks.push({ name: 'Application API', ok: true, detail: `${nodes?.meta?.pagination?.total ?? nodes?.data?.length ?? 0} node(s) visible` });
      } catch (err) {
        checks.push({ name: 'Application API', ok: false, detail: err.message });
      }
      try {
        const account = await client('/account');
        checks.push({ name: 'Client API', ok: true, detail: account?.attributes?.username || 'authenticated' });
      } catch (err) {
        checks.push({ name: 'Client API', ok: false, detail: err.message });
      }
      return { ok: checks.every((c) => c.ok), checks };
    },

    async listNodes() {
      const res = await app('/nodes');
      return (res?.data ?? []).map((n) => ({
        id: n.attributes.id,
        name: n.attributes.name,
        fqdn: n.attributes.fqdn,
        memory: n.attributes.memory,
        disk: n.attributes.disk,
      }));
    },

    async listEggs() {
      const nests = await app('/nests');
      const result = [];
      for (const nest of nests?.data ?? []) {
        const eggs = await app(`/nests/${nest.attributes.id}/eggs`);
        for (const egg of eggs?.data ?? []) {
          result.push({
            nestId: nest.attributes.id,
            eggId: egg.attributes.id,
            name: egg.attributes.name,
            nestName: nest.attributes.name,
          });
        }
      }
      return result;
    },

    /** Finds a free allocation on a node, creating one if every port is taken. */
    async ensureAllocation(nodeId, preferredPort) {
      const res = await app(`/nodes/${nodeId}/allocations?per_page=100`);
      const allocations = (res?.data ?? []).map((a) => ({
        id: a.attributes.id,
        ip: a.attributes.ip,
        port: a.attributes.port,
        assigned: Boolean(a.attributes.assigned),
      }));
      const free = allocations.find((a) => !a.assigned && (!preferredPort || a.port === preferredPort)) ??
        allocations.find((a) => !a.assigned);
      if (free) return free;
      const node = await app(`/nodes/${nodeId}`);
      const ip = node?.attributes?.fqdn ? null : node?.attributes?.public_ip;
      if (!ip) throw new PterodactylError('No free allocations and the node has no public IP to create one on', 409, null);
      const port = preferredPort || 25565 + Math.floor(Math.random() * 1000);
      const created = await app(`/nodes/${nodeId}/allocations`, {
        method: 'POST',
        body: { ip, ports: [String(port)] },
      });
      const attr = created?.attributes ?? created?.data?.attributes;
      return { id: attr?.id, ip: attr?.ip ?? ip, port: attr?.port ?? port };
    },

    async createServer({
      name,
      ramMb,
      cpuPercent,
      storageMb,
      nodeId,
      nestId,
      eggId,
      ownerId = 1,
      port,
      environment = {},
    }) {
      const allocation = await this.ensureAllocation(nodeId, port);
      const payload = {
        name,
        user: ownerId,
        egg: eggId,
        docker_image: environment.DOCKER_IMAGE || 'ghcr.io/pterodactyl/yolks:java_21',
        startup: environment.STARTUP || 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}',
        environment: {
          SERVER_JARFILE: 'server.jar',
          VANILLA_VERSION: environment.VANILLA_VERSION || 'latest',
          ...environment,
        },
        limits: {
          memory: ramMb,
          swap: 0,
          disk: storageMb,
          io: 500,
          cpu: cpuPercent,
        },
        feature_limits: { databases: 0, allocations: 0, backups: 0 },
        deploy: {
          locations: [nodeId],
          dedicated_ip: false,
          port_range: [],
        },
        start_on_completion: false,
        allocation: { default: allocation.id },
        nest_id: nestId,
      };
      const res = await app('/servers', { method: 'POST', body: payload });
      const attr = res?.attributes;
      if (!attr) throw new PterodactylError('Panel did not return the created server', 502, res);
      return {
        providerServerId: String(attr.id),
        identifier: attr.identifier,
        ip: allocation.ip,
        port: allocation.port,
      };
    },

    async deleteServer(providerServerId) {
      await app(`/servers/${providerServerId}`, { method: 'DELETE' });
    },

    async power(providerServerId, action) {
      const signal = action === 'stop' ? 'stop' : action;
      await client(`/servers/${providerServerId}/power`, { method: 'POST', body: { signal } });
      return { ok: true };
    },

    async resources(providerServerId) {
      const res = await client(`/servers/${providerServerId}/resources`);
      const attr = res?.attributes ?? {};
      const state = attr.current_state ?? 'offline';
      const normalized =
        state === 'running' ? 'running' : state === 'starting' ? 'starting' : state === 'stopping' ? 'stopping' : 'offline';
      return {
        state: attr.is_suspended ? 'suspended' : normalized,
        cpuPercent: typeof attr.resources?.cpu_absolute === 'number' ? Math.round(attr.resources.cpu_absolute * 10) / 10 : null,
        ramUsedMb: typeof attr.resources?.memory_bytes === 'number' ? Math.round(attr.resources.memory_bytes / 1024 / 1024) : null,
        diskUsedMb: typeof attr.resources?.disk_bytes === 'number' ? Math.round(attr.resources.disk_bytes / 1024 / 1024) : null,
        uptimeSeconds: attr.resources?.uptime ?? null,
        players: [],
        playerCount: null,
        maxPlayers: null,
      };
    },

    async listFiles(providerServerId, directory = '/') {
      const res = await client(`/servers/${providerServerId}/files/list?directory=${encodeURIComponent(directory)}`);
      return (res?.data ?? []).map((f) => ({
        name: f.attributes.name,
        path: `${directory === '/' ? '' : directory}/${f.attributes.name}`,
        type: f.attributes.is_file ? 'file' : 'dir',
        size: f.attributes.size,
        modifiedAt: f.attributes.modified_at,
      }));
    },

    async readFile(providerServerId, file) {
      const res = await fetch(
        `${base}/api/client/servers/${providerServerId}/files/contents?file=${encodeURIComponent(file)}`,
        { headers: { Authorization: `Bearer ${clientKey}`, Accept: 'text/plain' } }
      );
      if (!res.ok) throw new PterodactylError(`Could not read ${file} (${res.status})`, res.status, null);
      const text = await res.text();
      if (text.length > 512000) throw new PterodactylError('File is larger than the 500 KB editor limit', 413, null);
      return text;
    },

    async writeFile(providerServerId, file, content) {
      await client(`/servers/${providerServerId}/files/write?file=${encodeURIComponent(file)}`, {
        method: 'POST',
        body: content,
        headers: { 'Content-Type': 'text/plain' },
      });
      return { ok: true };
    },

    async deleteFiles(providerServerId, root, files) {
      await client(`/servers/${providerServerId}/files/delete`, {
        method: 'POST',
        body: { root, files },
      });
      return { ok: true };
    },

    async renameFile(providerServerId, root, from, to) {
      await client(`/servers/${providerServerId}/files/rename`, {
        method: 'POST',
        body: { root, files: [{ from, to }] },
      });
      return { ok: true };
    },

    async createFolder(providerServerId, root, name) {
      await client(`/servers/${providerServerId}/files/create-folder`, {
        method: 'POST',
        body: { root, name },
      });
      return { ok: true };
    },

    /** Panel-side download: the node pulls the file itself (no proxying through Jasfer). */
    async pullFile(providerServerId, url, directory = '/plugins') {
      await client(`/servers/${providerServerId}/files/pull`, {
        method: 'POST',
        body: { url, directory },
      });
      return { ok: true };
    },

    async websocketCredentials(providerServerId) {
      const res = await client(`/servers/${providerServerId}/websocket`);
      const data = res?.data ?? {};
      if (!data.socket || !data.token) throw new PterodactylError('Panel did not return console credentials', 502, res);
      return { socket: data.socket, token: data.token };
    },

    /**
     * Opens the panel's console websocket and forwards output lines.
     * Returns { sendCommand, close }.
     */
    async attachConsole(providerServerId, { onLine, onStatus } = {}) {
      const { socket, token } = await this.websocketCredentials(providerServerId);
      const ws = new WebSocket(socket, {
        headers: {
          Origin: base,
          'User-Agent': 'JasferHosting/1.0',
        },
      });
      let ready = false;
      const queue = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({ event: 'auth', args: [token] }));
      });
      ws.on('message', (raw) => {
        let payload;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (payload.event === 'auth success') {
          ready = true;
          for (const cmd of queue.splice(0)) {
            ws.send(JSON.stringify({ event: 'send command', args: [cmd] }));
          }
          return;
        }
        if (payload.event === 'console output') {
          for (const line of payload.args ?? []) onLine?.(String(line));
          return;
        }
        if (payload.event === 'status') {
          onStatus?.(String(payload.args?.[0] ?? 'offline'));
          return;
        }
        if (payload.event === 'token expiring') {
          this.websocketCredentials(providerServerId)
            .then((fresh) => ws.send(JSON.stringify({ event: 'auth', args: [fresh.token] })))
            .catch(() => {});
          return;
        }
        if (payload.event === 'token expired') {
          ws.close();
        }
      });

      return {
        sendCommand(command) {
          if (!ready) {
            queue.push(command);
            return;
          }
          ws.send(JSON.stringify({ event: 'send command', args: [command] }));
        },
        close() {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
        onClose(handler) {
          ws.on('close', handler);
        },
      };
    },
  };
}
