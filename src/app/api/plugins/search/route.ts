import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { errorResponse, json } from '@/lib/api';
import { searchPlugins } from '@/lib/plugins';
import { requireServerAccess } from '@/lib/server-access';
import type { SoftwareId } from '@/lib/minecraft';

const query = z.object({
  q: z.string().trim().max(80).default(''),
  software: z.enum(['paper', 'purpur', 'vanilla', 'fabric', 'forge']).optional(),
  version: z.string().trim().max(32).optional(),
  serverId: z.string().trim().max(64).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const input = query.parse({
      q: url.searchParams.get('q') ?? '',
      software: url.searchParams.get('software') ?? undefined,
      version: url.searchParams.get('version') ?? undefined,
      serverId: url.searchParams.get('serverId') ?? undefined,
    });

    let software = (input.software ?? 'paper') as SoftwareId;
    let version = input.version ?? '';
    if (input.serverId) {
      const { server } = requireServerAccess(input.serverId, user);
      software = server.software;
      version = server.version;
    }

    const results = await searchPlugins({ query: input.q, software, version });
    return json({ results, software, version });
  } catch (error) {
    return errorResponse(error);
  }
}
