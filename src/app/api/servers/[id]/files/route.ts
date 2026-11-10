import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { ApiError, assertRateLimit, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { requireServerAccess } from '@/lib/server-access';
import { providerFor } from '@/lib/providers';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const directory = new URL(request.url).searchParams.get('path') || '/';
    const provider = await providerFor(server);
    const entries = await provider.listFiles(server, directory);
    return json({ path: directory, entries });
  } catch (error) {
    return errorResponse(error);
  }
}

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mkdir'),
    path: z.string().default('/'),
    name: z.string().trim().min(1).max(120).regex(/^[^/\\]+$/, 'Folder names cannot contain slashes'),
  }),
  z.object({
    action: z.literal('delete'),
    path: z.string().default('/'),
    names: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    action: z.literal('rename'),
    path: z.string().default('/'),
    from: z.string().min(1),
    to: z.string().trim().min(1).max(120).regex(/^[^/\\]+$/),
  }),
]);

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    assertRateLimit(`files:${id}:${user.id}`, 60, 60_000);
    const { server } = requireServerAccess(id, user);
    const input = schema.parse(await readJson(request));
    const provider = await providerFor(server);

    if (input.action === 'mkdir') {
      await provider.makeFolder(server, input.path, input.name);
      logActivity({ actorId: user.id, userId: server.owner_id, serverId: id, action: 'files.mkdir', detail: `${input.path}/${input.name}`, ip: getClientIp(request) });
    } else if (input.action === 'delete') {
      await provider.deletePaths(server, input.path, input.names);
      logActivity({ actorId: user.id, userId: server.owner_id, serverId: id, action: 'files.delete', detail: input.names.join(', '), ip: getClientIp(request) });
    } else {
      await provider.renamePath(server, input.path, input.from, input.to);
      logActivity({ actorId: user.id, userId: server.owner_id, serverId: id, action: 'files.rename', detail: `${input.from} -> ${input.to}`, ip: getClientIp(request) });
    }

    return json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return errorResponse(new ApiError('That file or folder no longer exists on the node.', 404));
    }
    return errorResponse(error);
  }
}
