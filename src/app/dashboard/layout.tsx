import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb, type PlanRow } from '@/lib/db';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const plan = user.plan_id
    ? ((getDb().prepare('SELECT * FROM plans WHERE id = ?').get(user.plan_id) as PlanRow | undefined) ?? null)
    : null;

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, role: user.role }}
      planName={plan ? plan.name : null}
    >
      {children}
    </DashboardShell>
  );
}
