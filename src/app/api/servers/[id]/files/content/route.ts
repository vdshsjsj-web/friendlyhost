import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { ApiError, errorResponse, getClientIp, json, readJson } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { requireServerAccess } from '@/lib/server-access';
import { providerFor } from '@/lib/providers';

type Params = { params: Promise<{ id: string }> };

const EDITABLE = /\.(txt|yml|yaml|json|properties|toml|conf|cfg|ini|log|sh|bat|mcfunction|md|html|css|js|xml)$/i;

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const file = new URL(request.url).searchParams.get('file');
    if (!file) throw new ApiError('Pass ?file=/path/to/file', 400);

    const provider = await providerFor(server);
    const content = await provider.readFile(server, file);
    return json({ file, content, editable: EDITABLE.test(file) || !file.includes('.') });
  } catch (error) {
    return errorResponse(error);
  }
}

const schema = z.object({
  file: z.string().min(1).max(400),
  content: z.string().max(500_000, 'Files over 500 KB cannot be edited in the panel'),
});

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { server } = requireServerAccess(id, user);
    const { file, content } = schema.parse(await readJson(request));

    const provider = await providerFor(server);
    await provider.writeFile(server, file, content);
    logActivity({
      actorId: user.id,
      userId: server.owner_id,
      serverId: id,
      action: 'files.write',
      detail: `Saved ${file}`,
      ip: getClientIp(request),
    });
    return json({ ok: true, bytes: Buffer.byteLength(content) });
  } catch (error) {
    return errorResponse(error);
  }
}
