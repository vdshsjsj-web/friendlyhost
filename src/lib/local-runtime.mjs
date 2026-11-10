/**
 * Jasfer local node runtime.
 *
 * Runs real Minecraft servers as child processes on this machine. Nothing here
 * fakes state: `status()` reports the actual process, and every console line is
 * forwarded from the real server's stdout.
 *
 * Shared between the Next.js API routes and the WebSocket relay in server.js -
 * both import this exact file URL, so Node's module cache gives them one
 * registry (one process manager).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveSoftware, downloadTo } from './downloads.mjs';

const execFileAsync = promisify(execFile);

const SERVERS_DIR = path.resolve(process.env.JASFER_SERVERS_DIR || './data/servers');
const JAVA_BIN = process.env.JAVA_BIN || 'java';
const MAX_BUFFER = 800;
const HZ = 100;

/** serverId -> runtime entry */
const registry = new Map();

function serverDir(serverId) {
  return path.join(SERVERS_DIR, serverId);
}
function metaPath(serverId) {
  return path.join(serverDir(serverId), '.jasfer.json');
}
function logPath(serverId) {
  return path.join(serverDir(serverId), 'console.log');
}

export function isEnabled() {
  return process.env.JASFER_LOCAL_PROVIDER !== 'false';
}

export async function javaAvailable() {
  try {
    const { stdout } = await execFileAsync(JAVA_BIN, ['-version'], { timeout: 8000 });
    return { available: true, version: (stdout || '').split('\n')[0] || 'java' };
  } catch (err) {
    try {
      const { stderr } = await execFileAsync(JAVA_BIN, ['-version'], { timeout: 8000 });
      return { available: true, version: (stderr || '').split('\n')[0] || 'java' };
    } catch {
      return { available: false, version: null, error: err?.message };
    }
  }
}

function memoryInfo() {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  let availableMb = Math.floor(os.freemem() / 1024 / 1024);
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/MemAvailable:\s+(\d+) kB/);
    if (match) availableMb = Math.floor(Number(match[1]) / 1024);
  } catch {
    /* non-Linux: keep os.freemem() */
  }
  return { totalMb, availableMb };
}

export function capacity() {
  const { totalMb, availableMb } = memoryInfo();
  return { totalMb, availableMb, cpuCount: os.cpus().length, platform: `${os.platform()} ${os.arch()}` };
}

async function readMeta(serverId) {
  try {
    return JSON.parse(await fsp.readFile(metaPath(serverId), 'utf8'));
  } catch {
    return null;
  }
}

async function writeMeta(serverId, meta) {
  await fsp.mkdir(serverDir(serverId), { recursive: true });
  await fsp.writeFile(metaPath(serverId), JSON.stringify(meta, null, 2));
}

function createEntry(serverId) {
  const entry = {
    serverId,
    child: null,
    state: 'offline',
    stateMessage: null,
    startedAt: null,
    lines: [],
    listeners: new Set(),
    players: new Set(),
    maxPlayers: 20,
    lastCpu: null,
    cpuPercent: null,
    ramUsedMb: null,
    stopping: false,
    pendingStop: null,
    meta: null,
  };
  registry.set(serverId, entry);
  return entry;
}

function getEntry(serverId) {
  return registry.get(serverId) ?? null;
}

async function loadHistory(serverId, entry) {
  if (entry.historyLoaded) return;
  entry.historyLoaded = true;
  try {
    const raw = await fsp.readFile(logPath(serverId), 'utf8');
    const tail = raw.split('\n').slice(-MAX_BUFFER).filter(Boolean);
    entry.lines = tail;
  } catch {
    entry.lines = [];
  }
}

function broadcast(entry, message) {
  for (const listener of entry.listeners) {
    try {
      listener(message);
    } catch {
      /* ignore listener failures */
    }
  }
}

function appendLine(entry, line, { persist = true } = {}) {
  const stamped = line.replace(/\r$/, '');
  if (!stamped.trim()) return;
  entry.lines.push(stamped);
  if (entry.lines.length > MAX_BUFFER) entry.lines.splice(0, entry.lines.length - MAX_BUFFER);
  if (persist) {
    fs.appendFile(logPath(entry.serverId), `${stamped}\n`, () => {});
  }
  trackPlayers(entry, stamped);
  trackState(entry, stamped);
  broadcast(entry, { type: 'line', line: stamped });
}

function trackPlayers(entry, line) {
  const joined = line.match(/\]:?\s*([A-Za-z0-9_]{1,16}) joined the game/);
  if (joined) entry.players.add(joined[1]);
  const left = line.match(/\]:?\s*([A-Za-z0-9_]{1,16}) lost connection|([A-Za-z0-9_]{1,16}) left the game/);
  if (left) entry.players.delete(left[1] || left[2]);
  const list = line.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)$/);
  if (list) {
    entry.maxPlayers = Number(list[2]) || entry.maxPlayers;
    const names = (list[3] || '').split(',').map((n) => n.trim()).filter(Boolean);
    entry.players = new Set(names);
  }
}

function trackState(entry, line) {
  if (/Done \([0-9.]+s\)! For help/.test(line)) {
    entry.state = 'running';
    entry.stateMessage = null;
    broadcast(entry, { type: 'status', status: { state: 'running', players: [...entry.players] } });
  }
  if (/Starting minecraft server version/.test(line) && entry.state === 'offline') {
    entry.state = 'starting';
    broadcast(entry, { type: 'status', status: { state: 'starting', players: [] } });
  }
}

function setState(entry, state, message = null) {
  entry.state = state;
  entry.stateMessage = message;
  broadcast(entry, { type: 'status', status: { state, message, players: [...entry.players] } });
}

function sampleProcess(entry) {
  const pid = entry.child?.pid;
  if (!pid) {
    entry.cpuPercent = null;
    entry.ramUsedMb = null;
    return;
  }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    const totalTicks = utime + stime;
    const now = Date.now();
    if (entry.lastCpu) {
      const deltaTicks = totalTicks - entry.lastCpu.ticks;
      const deltaSec = (now - entry.lastCpu.at) / 1000;
      if (deltaSec > 0) entry.cpuPercent = Math.max(0, Math.round((deltaTicks / HZ / deltaSec) * 1000) / 10);
    }
    entry.lastCpu = { ticks: totalTicks, at: now };
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const rss = status.match(/VmRSS:\s+(\d+) kB/);
    if (rss) entry.ramUsedMb = Math.round(Number(rss[1]) / 1024);
  } catch {
    /* /proc not available or process gone */
  }
}

function javaFlags(ramMb) {
  const heap = Math.max(256, ramMb);
  return [
    `-Xms${Math.max(256, Math.floor(heap / 2))}M`,
    `-Xmx${heap}M`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-Dusing.aikars.flags=https://mcflags.emc.gs',
    '-Daikars.new.flags=true',
  ];
}

async function writeServerProperties(serverId, meta) {
  const file = path.join(serverDir(serverId), 'server.properties');
  const defaults = {
    'server-port': meta.port,
    'server-ip': '',
    motd: meta.motd || 'A Jasfer Hosting server',
    'max-players': meta.maxPlayers ?? 20,
    'online-mode': meta.edition === 'bedrock' ? 'true' : 'true',
    'enable-command-block': 'true',
    'view-distance': '8',
    'simulation-distance': '6',
    'spawn-protection': '0',
    'allow-flight': 'true',
    difficulty: 'normal',
    gamemode: 'survival',
    pvp: 'true',
    'level-name': 'world',
    'white-list': 'false',
    'enable-status': 'true',
  };
  if (meta.edition === 'bedrock') {
    await fsp.writeFile(
      path.join(serverDir(serverId), 'server.properties'),
      [
        `server-name=${meta.name || 'Jasfer Hosting'}`,
        'gamemode=survival',
        'difficulty=normal',
        `server-port=${meta.port}`,
        `server-portv6=${meta.port + 1}`,
        'max-players=20',
        'online-mode=true',
        'allow-cheats=false',
        'view-distance=10',
        'player-idle-timeout=30',
        'level-name=world',
      ].join('\n')
    );
    return;
  }
  let existing = '';
  try {
    existing = await fsp.readFile(file, 'utf8');
  } catch {
    /* first boot */
  }
  const map = new Map(
    existing
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  for (const [key, value] of Object.entries(defaults)) {
    if (!map.has(key)) map.set(key, String(value));
  }
  map.set('server-port', String(meta.port));
  if (meta.motd) map.set('motd', String(meta.motd));
  const body = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('\n');
  await fsp.writeFile(file, `${body}\n`);
}

/**
 * Prepares a server directory and downloads the real server software.
 * Long running (10s - 3min) - callers should run this in the background.
 */
export async function provision({ serverId, name, software, version, edition = 'java', ramMb, port, motd, maxPlayers }) {
  const dir = serverDir(serverId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(path.join(dir, 'plugins'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'mods'), { recursive: true });

  const meta = { name, software, version, edition, ramMb, port, motd, maxPlayers: maxPlayers ?? 20, provisionedAt: new Date().toISOString() };
  await writeMeta(serverId, meta);
  await writeServerProperties(serverId, meta);
  await fsp.writeFile(path.join(dir, 'eula.txt'), 'eula=true\n');

  const artifact = await resolveSoftware({ software, version, edition });

  if (edition === 'bedrock') {
    const zip = path.join(dir, 'bedrock-server.zip');
    await downloadTo(artifact.url, zip);
    await execFileAsync('unzip', ['-o', zip, '-d', dir], { maxBuffer: 8 * 1024 * 1024 });
    await fsp.chmod(path.join(dir, 'bedrock_server'), 0o755).catch(() => {});
    await fsp.rm(zip, { force: true });
    meta.startCommand = 'bedrock_server';
    await writeMeta(serverId, meta);
    return { ok: true, source: artifact.source, file: 'bedrock_server' };
  }

  const jarPath = path.join(dir, 'server.jar');
  await downloadTo(artifact.url, jarPath);
  meta.jarName = artifact.name;
  meta.source = artifact.source;

  if (artifact.installer) {
    // Forge: run the official installer to produce libraries + run scripts.
    await execFileAsync(JAVA_BIN, ['-jar', jarPath, '--installServer', dir], {
      cwd: dir,
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024,
    });
    meta.forgeVersion = artifact.forgeVersion;
    meta.installerComplete = true;
    const runSh = path.join(dir, 'run.sh');
    meta.startCommand = (await fsp.stat(runSh).then(() => true).catch(() => false)) ? 'run.sh' : 'forge-args';
  }
  await writeMeta(serverId, meta);
  return { ok: true, source: artifact.source, file: artifact.name };
}

async function buildStartCommand(serverId, meta) {
  const dir = serverDir(serverId);
  if (meta.edition === 'bedrock') {
    return { cmd: path.join(dir, 'bedrock_server'), args: [], env: { LD_LIBRARY_PATH: dir } };
  }
  if (meta.startCommand === 'run.sh') {
    return { cmd: 'bash', args: ['run.sh', 'nogui'], env: {} };
  }
  if (meta.startCommand === 'forge-args') {
    const argsFile = path.join(dir, 'libraries', 'net', 'minecraftforge', 'forge');
    let unixArgs = null;
    try {
      const versions = await fsp.readdir(argsFile);
      const latest = versions.sort().pop();
      unixArgs = path.join(argsFile, latest, 'unix_args.txt');
    } catch {
      /* fall through */
    }
    if (unixArgs) {
      return { cmd: JAVA_BIN, args: [...javaFlags(meta.ramMb), `@${unixArgs}`, 'nogui'], env: {} };
    }
  }
  return { cmd: JAVA_BIN, args: [...javaFlags(meta.ramMb), '-jar', 'server.jar', 'nogui'], env: {} };
}

/** Starts the real server process. Throws when the host cannot support it. */
export async function start(serverId) {
  const entry = getEntry(serverId) ?? createEntry(serverId);
  if (entry.child && !entry.child.killed && entry.state !== 'offline') {
    return { ok: true, alreadyRunning: true, state: entry.state };
  }
  const meta = (await readMeta(serverId)) ?? entry.meta;
  if (!meta) throw new Error('This server has not finished provisioning on the local node yet.');
  entry.meta = meta;

  const { availableMb } = memoryInfo();
  const needed = Number(meta.ramMb || 1024);
  if (availableMb < needed + 128) {
    throw new Error(
      `Not enough free memory on this node: the server needs ${needed} MB but only ${availableMb} MB is available. Lower the plan RAM or connect a bigger node.`
    );
  }

  const { cmd, args, env } = await buildStartCommand(serverId, meta);
  await loadHistory(serverId, entry);

  entry.stopping = false;
  setState(entry, 'starting');
  appendLine(entry, `[jasfer] starting ${meta.software} ${meta.version} (${meta.edition}) with ${needed} MB RAM`);

  const child = spawn(cmd, args, {
    cwd: serverDir(serverId),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  entry.child = child;
  entry.startedAt = Date.now();
  entry.players = new Set();

  const onData = (chunk) => {
    for (const line of chunk.toString('utf8').split('\n')) appendLine(entry, line);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    appendLine(entry, `[jasfer] failed to launch process: ${err.message}`);
    setState(entry, 'error', err.message);
    entry.child = null;
  });

  child.on('exit', (code, signal) => {
    entry.child = null;
    entry.startedAt = null;
    entry.players = new Set();
    entry.lastCpu = null;
    appendLine(entry, `[jasfer] server process exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`);
    setState(entry, code === 0 ? 'offline' : 'error', code === 0 ? null : `Exited with code ${code ?? signal}`);
    if (entry.pendingStop) {
      entry.pendingStop.resolve();
      entry.pendingStop = null;
    }
  });

  return { ok: true, state: 'starting' };
}

export async function stop(serverId, { force = false } = {}) {
  const entry = getEntry(serverId);
  if (!entry?.child) return { ok: true, state: 'offline', note: 'process was not running' };
  entry.stopping = true;
  setState(entry, 'stopping');

  const exited = new Promise((resolve) => {
    entry.pendingStop = { resolve };
    const timeout = setTimeout(() => {
      if (entry.child) {
        appendLine(entry, '[jasfer] graceful stop timed out - sending SIGKILL');
        try {
          entry.child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
      resolve();
    }, force ? 3000 : 30000);
    entry.pendingStop.timeout = timeout;
  });

  if (force) {
    try {
      entry.child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  } else {
    try {
      entry.child.stdin.write(entry.meta?.edition === 'bedrock' ? 'stop\n' : 'stop\n');
    } catch {
      try {
        entry.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
  await exited;
  if (entry.pendingStop?.timeout) clearTimeout(entry.pendingStop.timeout);
  return { ok: true, state: entry.state };
}

export async function restart(serverId) {
  await stop(serverId, { force: false });
  return start(serverId);
}

export async function sendCommand(serverId, command) {
  const entry = getEntry(serverId);
  if (!entry?.child?.stdin?.writable) {
    throw new Error('The server process is not running on this node.');
  }
  const clean = String(command).replace(/[\r\n]+/g, ' ').slice(0, 1000);
  appendLine(entry, `> ${clean}`);
  entry.child.stdin.write(`${clean}\n`);
  return { ok: true };
}

export async function status(serverId) {
  const entry = getEntry(serverId);
  if (!entry) {
    const meta = await readMeta(serverId);
    return {
      state: 'offline',
      players: [],
      playerCount: 0,
      maxPlayers: meta?.maxPlayers ?? 20,
      cpuPercent: null,
      ramUsedMb: null,
      uptimeSeconds: null,
      pid: null,
      message: meta ? null : 'Not provisioned on this node yet',
    };
  }
  sampleProcess(entry);
  return {
    state: entry.state,
    message: entry.stateMessage,
    players: [...entry.players],
    playerCount: entry.players.size,
    maxPlayers: entry.maxPlayers,
    cpuPercent: entry.cpuPercent,
    ramUsedMb: entry.ramUsedMb,
    uptimeSeconds: entry.startedAt ? Math.round((Date.now() - entry.startedAt) / 1000) : null,
    pid: entry.child?.pid ?? null,
  };
}

export async function consoleHistory(serverId) {
  const entry = getEntry(serverId) ?? createEntry(serverId);
  await loadHistory(serverId, entry);
  return entry.lines.slice(-400);
}

export async function attachConsole(serverId, listener) {
  const entry = getEntry(serverId) ?? createEntry(serverId);
  await loadHistory(serverId, entry);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

/** Called on boot: anything previously "running" is really offline. */
export async function reconcileOnBoot() {
  for (const entry of registry.values()) {
    if (entry.state !== 'offline') setState(entry, 'offline', 'Panel restarted');
  }
}

export function listRuntimeServers() {
  return [...registry.keys()];
}
