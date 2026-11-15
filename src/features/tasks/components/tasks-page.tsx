import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { taskSeed } from '../model';
import { Tasks } from './tasks';
export const metadata: Metadata = { title: 'Personal tasks' };
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const seed = taskSeed(query);
  const focus = typeof query.focus === 'string' && /^[a-f0-9-]{36}$/i.test(query.focus) ? query.focus : null;
  return (
    <>
      <PageHeader eyebrow="Your next steps" title="Personal tasks" />
      <Tasks key={`${session.user.id}:${JSON.stringify(seed)}:${focus}`} seed={seed} focus={focus} />
    </>
  );
}
