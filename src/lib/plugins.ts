/**
 * Plugin + mod discovery and installation.
 *
 * Modrinth's public API is free and needs no API key. Every download URL is
 * fetched live and verified to belong to the requested project before the file
 * is installed on a node.
 */
import type { SoftwareId } from './minecraft';

const UA = 'JasferHosting/1.0 (self-hosted Minecraft panel)';
const LOADERS: Record<SoftwareId, string[]> = {
  paper: ['paper', 'spigot', 'bukkit', 'purpur', 'folia'],
  purpur: ['purpur', 'paper', 'spigot', 'bukkit', 'folia'],
  vanilla: [],
  fabric: ['fabric', 'quilt'],
  forge: ['forge', 'neoforge'],
};

export type PluginHit = {
  projectId: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  author: string;
  categories: string[];
  projectType: string;
};

export type PluginFile = {
  projectId: string;
  name: string;
  versionNumber: string;
  fileName: string;
  downloadUrl: string;
  loader: string;
  gameVersions: string[];
};

function projectTypeFor(software: SoftwareId): 'plugin' | 'mod' | null {
  if (software === 'vanilla') return null;
  return LOADERS[software].includes('fabric') || LOADERS[software].includes('forge') ? 'mod' : 'plugin';
}

async function modrinth(path: string, timeout = 15000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`https://api.modrinth.com/v2${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Modrinth responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPlugins({
  query,
  software,
  version,
  limit = 20,
}: {
  query: string;
  software: SoftwareId;
  version: string;
  limit?: number;
}): Promise<PluginHit[]> {
  const projectType = projectTypeFor(software);
  if (!projectType) return [];
  const loaders = LOADERS[software];
  const facets: string[][] = [[`project_type:${projectType}`], loaders.map((l) => `categories:${l}`)];
  if (version && version !== 'latest') facets.push([`versions:${version}`]);

  const params = new URLSearchParams({
    query: query || '',
    limit: String(Math.min(limit, 40)),
    index: 'relevance',
    facets: JSON.stringify(facets),
  });

  const data = await modrinth(`/search?${params.toString()}`);
  return (data?.hits ?? []).map((hit: any) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url ?? null,
    downloads: hit.downloads ?? 0,
    author: hit.author ?? '',
    categories: hit.categories ?? [],
    projectType: hit.project_type ?? projectType,
  }));
}

export async function resolvePluginFile({
  projectId,
  software,
  version,
}: {
  projectId: string;
  software: SoftwareId;
  version: string;
}): Promise<PluginFile> {
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(projectId)) throw new Error('Invalid Modrinth project id');
  const loaders = LOADERS[software];
  const params = new URLSearchParams();
  if (loaders.length) params.set('loaders', JSON.stringify(loaders));
  if (version && version !== 'latest') params.set('game_versions', JSON.stringify([version]));

  const versions = await modrinth(`/project/${encodeURIComponent(projectId)}/version?${params.toString()}`);
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`No build of this project supports ${software} ${version}`);
  }
  const chosen = versions[0];
  const file = (chosen.files ?? []).find((f: any) => f.primary) ?? chosen.files?.[0];
  if (!file?.url) throw new Error('Modrinth did not return a downloadable file');

  // Only accept Modrinth's own CDN for the resolved file.
  const url = new URL(file.url);
  if (!/(^|\.)modrinth\.com$|(^|\.)modrinth\.app$/.test(url.hostname)) {
    throw new Error('Resolved file is not hosted on Modrinth');
  }

  return {
    projectId,
    name: chosen.name ?? projectId,
    versionNumber: chosen.version_number ?? 'unknown',
    fileName: String(file.filename || `${projectId}.jar`).replace(/[^A-Za-z0-9._-]/g, '_'),
    downloadUrl: file.url,
    loader: (chosen.loaders ?? [])[0] ?? '',
    gameVersions: chosen.game_versions ?? [],
  };
}
