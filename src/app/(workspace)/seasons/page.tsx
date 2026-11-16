import { requireSession } from '../../../features/auth/server/session';
import { SeasonPass } from '../../../features/seasons/components/season-pass';
export const metadata = { title: 'Community Season' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireSession();
  return <SeasonPass />;
}
