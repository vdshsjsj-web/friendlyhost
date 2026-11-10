import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb, type PlanRow } from '@/lib/db';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/dashboard');

  const db = getDb();
  const plan = user.plan_id ? (db.prepare('SELECT * FROM plans WHERE id = ?').get(user.plan_id) as PlanRow | undefined) : undefined;

  return (
    <DashboardShell user={{ name: user.name, email: user.email, role: user.role }} planName={plan?.name ?? null}>
      {children}
    </DashboardShell>
  );
}
