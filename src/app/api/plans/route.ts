import { getDb, type PlanRow } from '@/lib/db';
import { errorResponse, json } from '@/lib/api';

export async function GET() {
  try {
    const plans = getDb()
      .prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC, price_cents ASC')
      .all() as PlanRow[];
    return json({
      plans: plans.map((plan) => ({
        ...plan,
        features: JSON.parse(plan.features || '[]'),
        is_free: Boolean(plan.is_free),
        active: Boolean(plan.active),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
