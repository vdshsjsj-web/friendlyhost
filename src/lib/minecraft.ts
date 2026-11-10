/**
 * Minecraft software catalogue + live version resolution.
 *
 * Versions come from the projects' own APIs, cached for an hour, with a curated
 * fallback list so the create-server form still works if an upstream API is
 * briefly unavailable. Provisioning always re-resolves against the live API.
 */

export type SoftwareId = 'paper' | 'purpur' | 'vanilla' | 'fabric' | 'forge';

export const SOFTWARE: Record<
  SoftwareId,
  { id: SoftwareId; name: string; blurb: string; ecosystem: 'plugins' | 'mods' | 'none'; recommended?: boolean; javaOnly: boolean }
> = {
  paper: {
    id: 'paper',
    name: 'Paper',
    blurb: 'High-performance Spigot fork. Best pick for plugin servers.',
    ecosystem: 'plugins',
    recommended: true,
    javaOnly: false,
  },
  purpur: {
    id: 'purpur',
    name: 'Purpur',
    blurb: 'Paper fork with extra gameplay and performance settings.',
    ecosystem: 'plugins',
    javaOnly: false,
  },
  vanilla: {
    id: 'vanilla',
    name: 'Vanilla',
    blurb: 'The official Mojang server. No plugins, pure Minecraft.',
    ecosystem: 'none',
    javaOnly: false,
  },
  fabric: {
    id: 'fabric',
    name: 'Fabric',
    blurb: 'Lightweight mod loader for modern client and server mods.',
    ecosystem: 'mods',
    javaOnly: false,
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    blurb: 'The classic mod loader for large modpacks.',
    ecosystem: 'mods',
    javaOnly: false,
  },
};

const FALLBACK_JAVA_VERSIONS = [
  '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1',
  '1.16.5', '1.15.2', '1.14.4', '1.12.2', '1.8.9',
];

type CacheEntry = { at: number; versions: string[] };
const cache = new Map<string, CacheEntry>();
const TTL = 60 * 60 * 1000;

async function getJson(url: string, timeout = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'JasferHosting/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sortVersions(versions: string[]): string[] {
  return [...new Set(versions)].sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const diff = (pb[i] || 0) - (pa[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

async function vanillaVersions(): Promise<string[]> {
  const manifest = await getJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  return (manifest.versions ?? []).filter((v: any) => v.type === 'release').map((v: any) => v.id);
}

async function paperVersions(): Promise<string[]> {
  try {
    const data = await getJson('https://fill.papermc.io/v3/projects/paper');
    const groups = data?.versions ?? {};
    const flat: string[] = [];
    for (const value of Object.values(groups)) {
      if (Array.isArray(value)) flat.push(...(value as string[]));
      else if (value && typeof value === 'object' && Array.isArray((value as any).versions)) {
        flat.push(...((value as any).versions as string[]));
      }
    }
    if (flat.length) return flat;
  } catch {
    /* try v2 */
  }
  const legacy = await getJson('https://api.papermc.io/v2/projects/paper');
  return legacy?.versions ?? [];
}

async function purpurVersions(): Promise<string[]> {
  const data = await getJson('https://api.purpurmc.org/v2/purpur');
  return data?.versions ?? [];
}

async function fabricVersions(): Promise<string[]> {
  const data = await getJson('https://meta.fabricmc.net/v2/versions/game');
  return (data ?? []).filter((v: any) => v.stable).map((v: any) => v.version);
}

async function forgeVersions(): Promise<string[]> {
  const data = await getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const promos = data?.promos ?? {};
  return Object.keys(promos)
    .filter((key) => key.endsWith('-latest'))
    .map((key) => key.replace('-latest', ''));
}

export async function getVersions(software: SoftwareId, edition: 'java' | 'bedrock' = 'java'): Promise<string[]> {
  if (edition === 'bedrock') return ['latest'];
  const key = `versions:${software}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.versions;

  let versions: string[] = [];
  try {
    switch (software) {
      case 'paper':
        versions = await paperVersions();
        break;
      case 'purpur':
        versions = await purpurVersions();
        break;
      case 'vanilla':
        versions = await vanillaVersions();
        break;
      case 'fabric':
        versions = await fabricVersions();
        break;
      case 'forge':
        versions = await forgeVersions();
        break;
    }
  } catch (error) {
    console.warn(`[versions] ${software} upstream failed, using fallback`, error);
  }
  if (!versions.length) versions = FALLBACK_JAVA_VERSIONS;
  versions = sortVersions(versions).slice(0, 80);
  cache.set(key, { at: Date.now(), versions });
  return versions;
}

export async function isValidVersion(
  software: SoftwareId,
  version: string,
  edition: 'java' | 'bedrock' = 'java'
): Promise<boolean> {
  if (edition === 'bedrock') return version === 'latest';
  const versions = await getVersions(software, edition);
  return versions.includes(version);
}

export const EDITIONS = [
  {
    id: 'java' as const,
    name: 'Java Edition',
    blurb: 'PC, Mac and Linux. Mods, plugins and every server software below.',
    port: 25565,
  },
  {
    id: 'bedrock' as const,
    name: 'Bedrock Edition',
    blurb: 'Phones, consoles and Windows. Runs the official Bedrock Dedicated Server.',
    port: 19132,
  },
];
