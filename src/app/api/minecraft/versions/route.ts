import { z } from 'zod';
import { errorResponse, json } from '@/lib/api';
import { SOFTWARE, getVersions, type SoftwareId } from '@/lib/minecraft';

const query = z.object({
  software: z.enum(['paper', 'purpur', 'vanilla', 'fabric', 'forge']).default('paper'),
  edition: z.enum(['java', 'bedrock']).default('java'),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { software, edition } = query.parse({
      software: url.searchParams.get('software') ?? undefined,
      edition: url.searchParams.get('edition') ?? undefined,
    });
    const versions = await getVersions(software as SoftwareId, edition);
    return json({ software, edition, versions, recommended: versions[0] ?? null, meta: SOFTWARE[software as SoftwareId] });
  } catch (error) {
    return errorResponse(error);
  }
}
