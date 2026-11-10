import PlanManager from '@/components/admin/PlanManager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Plans' };

export default function AdminPlansPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Administration</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Hosting plans</h1>
        <p className="mt-1.5 text-sm muted">
          RAM, CPU, storage and server-count limits are enforced by the create-server API, so a plan cannot be exceeded by
          calling the API directly.
        </p>
      </header>
      <PlanManager />
    </div>
  );
}
