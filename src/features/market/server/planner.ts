import '../../../lib/assert-server';
import { z } from 'zod';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { getDuneClient } from '../../../server/integrations/dune';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { AppError } from '../../../lib/errors';
import type { DashboardSession } from '../../auth/server/session-store';
import { collectPinnedItems, resolveItemCharacter } from '../../player/server/item-finder';
import { countPinnedItems } from '../../player/item-pins';
import { parseSolarisBalance } from '../../casino/server/console-gateway';
import {
  ACTIVITY_HOURS,
  PLANNER_MAX_BYTES,
  TEMPLATE_ID,
  bucketTrades,
  compareBudget,
  compareMaterial,
  decideAlert,
  estimatePurchase,
  plannerRecordSchema,
  summarizeLadder,
  summarizeSales,
  type AlertState,
  type LadderView,
  type PurchaseEstimate,
} from '../planner';
import { ladderKey, readLadders, type Ladder } from './price-ladder';
import {
  PRICE_SAMPLE_INTERVAL_MS,
  clearSearches,
  readAlertStates,
  readPlanner,
  readPricePoints,
  readSearches,
  savePlanner,
  writeAlertStates,
} from './planner-store';
import { readTrades } from './transactions';

/** Route handlers for the private market planner. Thin `/api/v2/market/*` route files delegate here. */

async function limited(session: DashboardSession, bucket: string, limit: number) {
  const result = await checkRateLimit(`v2:${bucket}:${session.user.id}`, { limit, windowMs: 60_000 });
  if (!result.allowed)
    throw new AppError('Market planner request limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
}
async function budgeted() {
  const budget = await spendReadBudget();
  if (!budget.allowed)
    throw new AppError('Market read capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
}

export async function getPlanner() {
  const session = await requireApiSession();
  await limited(session, 'market-planner', 30);
  const record = await readPlanner(session.user.id);
  let searches: string[] | null = null;
  try {
    searches = await readSearches(session.user.id);
  } catch {
    searches = null; // History is optional; the planner itself still loads and the UI says history is unavailable.
  }
  return json({ ...record, searches });
}

export async function putPlanner(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limited(session, 'market-planner', 30);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new AppError('Send market planner settings as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, PLANNER_MAX_BYTES);
  if (!body) throw new AppError('Market planner settings exceed the limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('Market planner settings are invalid.', 400, 'INVALID_PLANNER', true);
  }
  const parsed = plannerRecordSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((entry) => entry.code === 'custom')?.message;
    throw new AppError(issue ?? 'Market planner settings are invalid.', 400, 'INVALID_PLANNER', true);
  }
  return json(await savePlanner(session.user.id, parsed.data.revision, parsed.data.planner));
}

export async function deleteSearches(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limited(session, 'market-planner', 30);
  await clearSearches(session.user.id);
  return json({ searches: [] });
}

function ladderView(ladder: Ladder | undefined): LadderView {
  if (!ladder) return { status: 'unavailable', message: 'Not read.', readAt: new Date().toISOString() };
  if (ladder.status !== 'ok') return ladder;
  return {
    status: 'ok',
    summary: summarizeLadder(ladder.orders),
    rejected: ladder.rejected,
    truncated: ladder.truncated,
    readAt: ladder.readAt,
  };
}
/** Truncated or partly unreadable ladders cannot support a complete estimate. */
function estimateFrom(ladder: Ladder | undefined, quantity: string): PurchaseEstimate | null {
  if (!ladder || ladder.status !== 'ok' || ladder.truncated || ladder.rejected) return null;
  return estimatePurchase(ladder.orders, quantity);
}

type BalanceView = { status: 'ok'; balance: string; readAt: string } | { status: 'unlinked' | 'unavailable' };
async function readBalance(session: DashboardSession, signal: AbortSignal): Promise<BalanceView> {
  let player: string;
  try {
    ({ player } = await resolveItemCharacter(session));
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 403) return { status: 'unlinked' };
    return { status: 'unavailable' };
  }
  try {
    // Read-only: the planner never moves, reserves or adjusts Solaris.
    const payload = await getDuneClient().request('GET', `/api/players/${encodeURIComponent(player)}/currency`, {
      timeoutMs: 8_000,
      signal,
    });
    return { status: 'ok', balance: parseSolarisBalance(payload).toString(), readAt: new Date().toISOString() };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function getPlannerReadings(request: Request) {
  const session = await requireApiSession();
  await limited(session, 'market-readings', 10);
  await budgeted();
  const { planner } = await readPlanner(session.user.id);
  const [ladders, balance, previous] = await Promise.all([
    readLadders([...planner.watches, ...planner.basket], request.signal),
    planner.basket.length
      ? readBalance(session, request.signal)
      : Promise.resolve<BalanceView>({ status: 'unavailable' }),
    readAlertStates(session.user.id),
  ]);
  const now = Date.now();
  const states: Record<string, AlertState> = {};
  const watches = planner.watches.map((watch) => {
    const ladder = ladders.get(ladderKey(watch.templateId, watch.grade));
    const view = ladderView(ladder);
    // An unreadable ladder is unknown, never "within range".
    const lowest = view.status === 'ok' && !view.truncated && !view.rejected ? view.summary.lowest : null;
    const alert = decideAlert(watch, lowest, previous[watch.id] ?? null, now);
    states[watch.id] = { condition: alert.condition, notifiedAt: alert.notifiedAt };
    return { id: watch.id, ladder: view, alert };
  });
  const alertsSaved = planner.watches.length ? await writeAlertStates(session.user.id, states) : true;
  const basket = planner.basket.map((line) => {
    const ladder = ladders.get(ladderKey(line.templateId, line.grade));
    return {
      key: ladderKey(line.templateId, line.grade),
      ladder: ladderView(ladder),
      estimate: estimateFrom(ladder, line.quantity),
    };
  });
  const budget = compareBudget(
    basket.map((line) => line.estimate),
    balance.status === 'ok' ? balance.balance : null,
    planner.budget,
  );
  return json({
    readAt: new Date(now).toISOString(),
    watches,
    alertsSaved,
    basket,
    budget,
    balance: balance.status === 'ok' ? { status: 'ok', readAt: balance.readAt } : balance,
  });
}

const priceQuery = z.object({
  templateId: z.string().regex(TEMPLATE_ID),
  grade: z.union([z.literal(''), z.string().regex(/^[0-9]{1,2}$/)]),
});
export async function getPriceHistory(request: Request) {
  const session = await requireApiSession();
  await limited(session, 'market-prices', 30);
  const params = new URL(request.url).searchParams;
  const parsed = priceQuery.safeParse({ templateId: params.get('templateId') ?? '', grade: params.get('grade') ?? '' });
  if (!parsed.success) throw new AppError('Choose a valid item and grade.', 400, 'INVALID_ITEM', true);
  const grade = parsed.data.grade === '' ? null : Number(parsed.data.grade);
  const { points, rejected } = await readPricePoints(parsed.data.templateId, grade);
  return json({ points, rejected, sampleIntervalMs: PRICE_SAMPLE_INTERVAL_MS });
}

export async function getProjectComparison(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new AppError('Choose a saved project.', 400, 'INVALID_PROJECT', true);
  await limited(session, 'market-planner', 30);
  const { planner } = await readPlanner(session.user.id);
  const project = planner.projects.find((entry) => entry.id === id);
  if (!project) throw new AppError('That project is no longer saved.', 404, 'PROJECT_NOT_FOUND', true);
  // Storage scans share the item finder's per-member limit, because they read the same sources.
  await limited(session, 'item-finder', 6);
  const character = await resolveItemCharacter(session);
  const reading = await collectPinnedItems(
    session,
    project.materials.map((material) => material.templateId),
    character,
    request.signal,
  );
  const counters = countPinnedItems(project.materials, reading);
  const compared = project.materials.map((material, index) =>
    compareMaterial(
      material,
      counters[index] ? { quantity: counters[index].quantity, complete: counters[index].complete } : null,
    ),
  );
  const toBuy = compared
    .filter((entry) => entry.toBuy !== '0')
    .map((entry) => ({ templateId: entry.templateId, grade: null }));
  const ladders = await readLadders(toBuy, request.signal);
  const materials = compared.map((entry) => ({
    ...entry,
    estimate: entry.toBuy === '0' ? null : estimateFrom(ladders.get(ladderKey(entry.templateId, null)), entry.toBuy),
  }));
  const { items: _items, ...coverage } = reading;
  return json({ project: { id: project.id, name: project.name }, materials, coverage });
}

const hoursSchema = z.coerce.number().pipe(z.union(ACTIVITY_HOURS.map((value) => z.literal(value))));
function hoursFrom(request: Request): (typeof ACTIVITY_HOURS)[number] {
  const parsed = hoursSchema.safeParse(new URL(request.url).searchParams.get('hours') ?? '168');
  if (!parsed.success) throw new AppError('Choose 24 hours, 7 days or 30 days.', 400, 'INVALID_RANGE', true);
  return parsed.data;
}

export async function getActivity(request: Request) {
  const session = await requireApiSession();
  const hours = hoursFrom(request);
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length > 128) throw new AppError('Search text is too long.', 400, 'INVALID_QUERY', true);
  await limited(session, 'market-activity', 6);
  await budgeted();
  const reading = await readTrades(hours, 'all', q);
  if (reading.status !== 'ok')
    return json({ status: reading.status, message: reading.message, readAt: reading.readAt });
  // Only aggregate buckets leave the server: no trader identities, item rows or seller IDs.
  return json({
    status: 'ok',
    hours,
    buckets: bucketTrades(reading.trades, hours, Date.now()),
    totals: reading.totals,
    coverage: { ...reading.coverage, sellerIds: undefined },
    readAt: reading.readAt,
  });
}

export async function getSales(request: Request) {
  const session = await requireApiSession();
  const hours = hoursFrom(request);
  await limited(session, 'market-activity', 6);
  await budgeted();
  const { player, controller } = await resolveItemCharacter(session);
  const reading = await readTrades(hours, 'player');
  if (reading.status !== 'ok')
    return json({ status: reading.status, message: reading.message, readAt: reading.readAt });
  if (!reading.coverage.sellerIds) {
    return json({
      status: 'unattributable',
      message: 'Completed orders on this Console do not include seller IDs, so sales cannot be attributed to you.',
      readAt: reading.readAt,
    });
  }
  const unattributed = reading.trades.filter((trade) => trade.sellerId === null).length;
  return json({
    status: 'ok',
    hours,
    summary: summarizeSales(reading.trades, new Set([player, controller])),
    coverage: { ...reading.coverage, sellerIds: undefined, unattributed },
    readAt: reading.readAt,
  });
}
