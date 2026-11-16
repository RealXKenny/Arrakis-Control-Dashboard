import '../../../lib/assert-server';
import { requireApiSession, json } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { identifier, emptyTotals, totalsRecordSchema, type Totals } from '../contracts';
import { fail, loadSeason, readRecord, seasonKeys } from './store';

export async function getCommunityProgress(_request: Request, context: { params: Promise<{ seasonId: string }> }) {
  const session = await requireApiSession();
  const { seasonId } = await context.params;
  if (!identifier.safeParse(seasonId).success) fail('Invalid season ID.', 400);
  const limit = await checkRateLimit(`v2:seasons-live:${session.user.id}`, { limit: 12, windowMs: 60000 });
  if (limit.storageUnavailable || !limit.allowed)
    fail(
      'Live progress is temporarily unavailable. Your saved progress is safe.',
      limit.storageUnavailable ? 503 : 429,
    );
  const [record, totals] = await Promise.all([loadSeason(seasonId), readRecord<Totals>(seasonKeys.totals(seasonId))]);
  const season = record.value;
  if (['draft', 'preview'].includes(season.phase)) fail('Season not published.', 404);
  if (totals.value && !totalsRecordSchema.safeParse(totals.value).success) throw new Error('Invalid community totals.');
  return json({
    ok: true,
    season: {
      id: season.id,
      phase: season.phase,
      revision: season.revision,
      version: season.version ?? 0,
      presentation: season.presentation,
    },
    totals: totalsRecordSchema.parse(totals.value ?? emptyTotals()),
    observedAt: new Date().toISOString(),
  });
}
