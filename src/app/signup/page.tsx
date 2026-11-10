import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';
import Logo from '@/components/Logo';
import { getCurrentUser } from '@/lib/auth';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Create account' };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const googleEnabled = Boolean(config.google.clientId && config.google.clientSecret);

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="aurora" aria-hidden />
      <div className="container-page relative flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Link href="/" aria-label="Jasfer Hosting home">
              <Logo size={44} />
            </Link>
          </div>
          <div className="card p-6 shadow-glow sm:p-8">
            <AuthForm mode="signup" googleEnabled={googleEnabled} />
          </div>
          <ul className="mt-6 space-y-1.5 text-center text-xs text-slate-500">
            <li>Free plan · 1 server · no card required</li>
            <li>Paper, Purpur, Vanilla, Fabric, Forge &amp; Bedrock</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
