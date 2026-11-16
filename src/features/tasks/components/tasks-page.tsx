import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { taskSeed } from '../model';
import { Tasks } from './tasks';
import { resolveActivity } from '../../activity-views/server/resolve';
import { ActivityBar } from '../../activity-views/components/activity-bar';
export const metadata: Metadata = { title: 'Personal tasks' };
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const activity = await resolveActivity(session.user.id, query.activity);
  const seed = taskSeed(query);
  const focus = typeof query.focus === 'string' && /^[a-f0-9-]{36}$/i.test(query.focus) ? query.focus : null;
  return (
    <>
      <PageHeader
        eyebrow="Your next steps"
        title="Personal tasks"
        description="Keep tasks, projects and goals together, with links to the things you are working on."
      />
      <ActivityBar state={activity} area="tasks" />
      {(activity.status === 'none' || activity.status === 'ok') && (
        <Tasks
          key={`${session.user.id}:${JSON.stringify(seed)}:${focus}:${activity.status === 'ok' ? JSON.stringify(activity.view) : 'normal'}`}
          seed={activity.status === 'ok' ? null : seed}
          focus={activity.status === 'ok' ? null : focus}
          activity={activity.status === 'ok' ? activity.view : null}
        />
      )}
    </>
  );
}
