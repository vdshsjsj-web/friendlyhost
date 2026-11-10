import { errorResponse, json } from '@/lib/api';
import { platformStatus } from '@/lib/providers';
import { config } from '@/lib/config';
import { getCurrentUser } from '@/lib/auth';

/**
 * Honest infrastructure status. The UI uses this to show whether servers can
 * really be created right now, and to render setup instructions when not.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const status = await platformStatus();
    return json({
      ...status,
      googleEnabled: Boolean(config.google.clientId && config.google.clientSecret),
      viewer: user ? { id: user.id, role: user.role } : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
