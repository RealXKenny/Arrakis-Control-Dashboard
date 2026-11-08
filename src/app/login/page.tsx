import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeNextPath } from '../../features/auth/schemas';
import { signInNotice } from '../../features/auth/notices';
import { currentSession } from '../../features/auth/server/session';
import { LoginPanel } from '../../features/auth/components/login-panel';

export const metadata: Metadata = { title: 'Sign in' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const next = safeNextPath(first(params.next));
  // Already signed in: never ask again.
  if (await currentSession().catch(() => null)) redirect(next);

  const error = first(params.error);
  const notice = signInNotice(error);

  return (
    <div className="mx-auto grid w-full max-w-shell gap-6 px-4 py-12 sm:px-6 lg:grid-cols-5 lg:py-20">
      <section className="panel flex flex-col justify-between gap-8 p-6 sm:p-8 lg:col-span-2">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Arrakis Control</p>
          <h1 className="text-3xl tracking-monolith">Enter the sietch</h1>
          <p className="text-sm leading-relaxed text-sand-300">
            Sign in to command your holdings, market listings, vehicles and bases. Your session stays open for 30 days
            until you sign out.
          </p>
        </div>
        <ul className="grid gap-3 text-xs text-sand-300">
          <li className="border border-sand-200/10 bg-obsidian-900/60 p-3">
            Discord is your identity and guild proof.
          </li>
          <li className="border border-sand-200/10 bg-obsidian-900/60 p-3">
            Add a password afterwards to sign in with your email.
          </li>
        </ul>
      </section>
      <LoginPanel next={next} initialTab={first(params.tab) === 'register' ? 'register' : 'login'} notice={notice} />
    </div>
  );
}
