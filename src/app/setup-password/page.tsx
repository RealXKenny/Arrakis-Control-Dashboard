import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeNextPath } from '../../features/auth/schemas';
import { requireSession } from '../../server/session';
import { SetPasswordForm } from './_components/set-password-form';

export const metadata: Metadata = { title: 'Complete your profile' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SetupPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  const session = await requireSession();
  // Nothing to do once a password exists (or if Discord never gave us a verified email to link).
  if (!session.needsPassword && session.email) redirect(next);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 lg:py-20">
      <section className="panel flex flex-col gap-6 p-6 sm:p-8" aria-labelledby="setup-title">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Step 2 of 2</p>
          <h1 id="setup-title" className="text-2xl tracking-monolith">
            Complete your profile
          </h1>
          <p className="text-sm leading-relaxed text-sand-300">
            Set a password so you can also sign in with your email. Discord sign-in keeps working either way.
          </p>
        </div>

        {session.email ? (
          <SetPasswordForm email={session.email} next={next} />
        ) : (
          <p className="border border-sand-200/10 bg-obsidian-900/60 p-4 text-sm text-sand-300">
            Discord did not share a verified email for your account, so password sign-in is unavailable. Verify your
            email in Discord, then sign in again.
          </p>
        )}

        <Link href={next} className="self-start text-xs uppercase tracking-[0.2em] text-sand-400 hover:text-spice-300">
          Skip for now
        </Link>
      </section>
    </div>
  );
}
