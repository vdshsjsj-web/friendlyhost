/**
 * Resolves official download URLs for Minecraft server software.
 * Every URL below points at the upstream project - no third-party mirrors.
 *
 *   paper   -> fill.papermc.io (PaperMC v3 API, v2 fallback)
 *   purpur  -> api.purpurmc.org
 *   vanilla -> Mojang version manifest
 *   fabric  -> meta.fabricmc.net
 *   forge   -> maven.minecraftforge.net installer
 *   bedrock -> official Bedrock Dedicated Server links API
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UA = 'JasferHosting/1.0 (self-hosted Minecraft panel)';

export async function fetchJson(url, { timeout = 20000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadTo(url, dest, { timeout = 600000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
    return { bytes: (await fsp.stat(dest)).size, url };
  } finally {
    clearTimeout(timer);
  }
}

/** Picks the newest build from a PaperMC v3 builds response. */
function pickPaperBuild(builds) {
  if (!Array.isArray(builds) || builds.length === 0) return null;
  for (let i = builds.length - 1; i >= 0; i -= 1) {
    const build = builds[i];
    const downloads = build?.downloads ?? {};
    for (const key of Object.keys(downloads)) {
      const entry = downloads[key];
      if (entry?.url) return { url: entry.url, name: entry.name || `paper-${build.id ?? 'latest'}.jar` };
    }
  }
  return null;
}

async function resolvePaper(version) {
  // PaperMC v3 ("fill") API.
  try {
    const builds = await fetchJson(
      `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`
    );
    const picked = pickPaperBuild(Array.isArray(builds) ? builds : builds?.builds);
    if (picked) return { ...picked, source: 'papermc-v3' };
  } catch {
    /* fall through to v2 */
  }
  // Legacy v2 API fallback.
  const legacy = await fetchJson(
    `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(version)}/builds`
  );
  const builds = legacy?.builds ?? [];
  const latest = builds[builds.length - 1];
  const app = latest?.downloads?.application;
  if (!latest || !app?.name) throw new Error(`Paper ${version} has no published builds`);
  return {
    url: `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(version)}/builds/${latest.build}/downloads/${app.name}`,
    name: app.name,
    source: 'papermc-v2',
  };
}

async function resolveVanilla(version) {
  const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = (manifest.versions || []).find((v) => v.id === version);
  if (!entry) throw new Error(`Minecraft ${version} is not in Mojang's version manifest`);
  const meta = await fetchJson(entry.url);
  const server = meta?.downloads?.server;
  if (!server?.url) throw new Error(`Minecraft ${version} has no server download`);
  return { url: server.url, name: `minecraft-server-${version}.jar`, source: 'mojang' };
}

async function resolvePurpur(version) {
  const meta = await fetchJson(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}`);
  const build = meta?.builds?.latest;
  if (!build) throw new Error(`Purpur ${version} has no published builds`);
  return {
    url: `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/${build}/download`,
    name: `purpur-${version}-${build}.jar`,
    source: 'purpur',
  };
}

async function resolveFabric(version) {
  const loaders = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`);
  const loader = (loaders || []).find((l) => l?.loader?.stable)?.loader ?? loaders?.[0]?.loader;
  if (!loader?.version) throw new Error(`Fabric has no loader for Minecraft ${version}`);
  return {
    url: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${loader.version}/server/jar`,
    name: `fabric-server-${version}-${loader.version}.jar`,
    source: 'fabric',
    loaderVersion: loader.version,
  };
}

async function resolveForge(version) {
  const promos = await fetchJson(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
  );
  const recommended = promos?.promos?.[`${version}-recommended`];
  const latest = promos?.promos?.[`${version}-latest`];
  const forgeVersion = recommended || latest;
  if (!forgeVersion) throw new Error(`Forge has no build for Minecraft ${version}`);
  const full = `${version}-${forgeVersion}`;
  return {
    url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`,
    name: `forge-${full}-installer.jar`,
    source: 'forge',
    installer: true,
    forgeVersion,
  };
}

/** Latest Bedrock Dedicated Server download from Mojang's links API. */
export async function resolveBedrock() {
  const data = await fetchJson('https://net-secondary.web.minecraft-services.net/api/v1.0/download/links');
  const links = data?.result?.links ?? [];
  const linux = links.find((l) => String(l?.downloadType || '').toLowerCase() === 'serverbedrocklinux');
  if (!linux?.downloadUrl) throw new Error('Mojang did not return a Bedrock Linux server download');
  return { url: linux.downloadUrl, name: 'bedrock-server.zip', source: 'mojang-bedrock' };
}

/**
 * Resolves the upstream artifact for a server definition.
 * @returns {Promise<{url:string,name:string,source:string,installer?:boolean,forgeVersion?:string}>}
 */
export async function resolveSoftware({ software, version, edition = 'java' }) {
  if (edition === 'bedrock') return resolveBedrock();
  switch (software) {
    case 'paper':
      return resolvePaper(version);
    case 'purpur':
      return resolvePurpur(version);
    case 'vanilla':
      return resolveVanilla(version);
    case 'fabric':
      return resolveFabric(version);
    case 'forge':
      return resolveForge(version);
    default:
      throw new Error(`Unsupported server software: ${software}`);
  }
}
