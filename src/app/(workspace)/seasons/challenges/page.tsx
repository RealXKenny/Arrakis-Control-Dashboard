import { requireSession } from '../../../../features/auth/server/session';
import { SeasonPass } from '../../../../features/seasons/components/season-pass';
export const metadata = { title: 'Season Challenges' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireSession();
  return <SeasonPass mode="challenges" />;
}
