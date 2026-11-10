import AdminUsers from '@/components/admin/AdminUsers';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Users' };

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-jasfer-300">Administration</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Users</h1>
        <p className="mt-1.5 text-sm muted">Suspend accounts, promote admins and assign hosting plans.</p>
      </header>
      <AdminUsers />
    </div>
  );
}
