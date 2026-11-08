import { redirect } from 'next/navigation';
import { safeNextPath } from '../../features/auth/schemas';
import { requireSession } from '../../features/auth/server/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Landing point after Discord OAuth: new members are sent to choose a password, everyone else continues. */
export default async function PostLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const destination = safeNextPath(Array.isArray(next) ? next[0] : next);
  const session = await requireSession();
  if (session.needsPassword) redirect(`/setup-password?next=${encodeURIComponent(destination)}`);
  redirect(destination);
}
