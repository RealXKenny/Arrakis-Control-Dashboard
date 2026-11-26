import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import {
  PLANNER_MAX_BYTES,
  defaultGearFilter,
  loadoutReadiness,
  matchesFilter,
  plannerRecordSchema,
  snapshotChanges,
  storageSuggestions,
  summarizeSnapshot,
  wearReadings,
  type HistoryRecord,
} from '../equipment';
import type { FoundItem } from '../item-finder';
import { collectInventory, resolveItemCharacter } from './item-finder';
import { appendSnapshot, readHistory, readPlanner, savePlanner } from './equipment-store';

const MATCH_LIMIT = 200;

async function context() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:equipment:${session.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed)
    throw new AppError('Equipment request limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const { controller, player } = await resolveItemCharacter(session);
  return { session, controller, player };
}
/** Full inventory scans share N001's six-per-minute member budget. */
async function scanBudget(userId: string) {
  const limit = await checkRateLimit(`v2:item-finder:${userId}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed) throw new AppError('Search limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
}
async function jsonBody(request: Request, limit: number): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new AppError('Send equipment data as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, limit);
  if (!body) throw new AppError('Equipment data exceeds the limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('Equipment data is invalid.', 400, 'INVALID_EQUIPMENT', true);
  }
}

export async function getPlanner() {
  const { session, controller, player } = await context();
  return json(await readPlanner(session.user.id, controller, player));
}
export async function putPlanner(request: Request) {
  const { session, controller, player } = await context();
  const parsed = plannerRecordSchema.safeParse(await jsonBody(request, PLANNER_MAX_BYTES));
  if (!parsed.success)
    throw new AppError(
      'Check loadouts, watchlist, filters and storage rules for missing or out-of-range values.',
      400,
      'INVALID_EQUIPMENT',
      true,
    );
  return json(await savePlanner(session.user.id, controller, player, parsed.data.revision, parsed.data.planner));
}

/** One fresh authorized scan; only derived plan views and bounded matching gear leave the server. */
export async function getEquipmentReadings(request: Request) {
  const { session, controller, player } = await context();
  const record = await readPlanner(session.user.id, controller, player);
  const filterId = new URL(request.url).searchParams.get('filter');
  const filter = filterId ? record.planner.filters.find((entry) => entry.id === filterId) : defaultGearFilter();
  if (!filter) throw new AppError('That saved filter no longer exists. Refresh plans.', 404, 'FILTER_NOT_FOUND', true);
  await scanBudget(session.user.id);
  const observation = await collectInventory(session, { controller, player }, request.signal);
  const { items, containers, ...coverage } = observation;
  const matching = items.filter((item) => matchesFilter(filter, item));
  const matches: FoundItem[] = matching
    .slice(0, MATCH_LIMIT)
    .map(({ sourceKind: _kind, container: _container, containerKey: _key, group: _group, ...item }) => item);
  return json({
    revision: record.revision,
    coverage,
    filter: { id: filterId, name: filter.name },
    matches,
    matchesLimited: matching.length > MATCH_LIMIT,
    readiness: record.planner.loadouts.map((loadout) => loadoutReadiness(loadout, items, coverage)),
    wear: wearReadings(record.planner.watchlist, items),
    storage: storageSuggestions(record.planner.storageRules, items, containers),
    containers: {
      checked: containers.length,
      verifiedCapacity: containers.filter((container) => container.maxSlots !== null).length,
    },
  });
}

function historyView(record: HistoryRecord) {
  return {
    revision: record.revision,
    snapshots: record.snapshots.map(({ totals, ...snapshot }) => ({ ...snapshot, templates: totals.length })),
    changes: record.snapshots.slice(1).map((after, index) => ({
      from: record.snapshots[index].id,
      to: after.id,
      changes: snapshotChanges(record.snapshots[index], after),
    })),
  };
}
export async function getInventoryHistory() {
  const { session, controller, player } = await context();
  return json(historyView(await readHistory(session.user.id, controller, player)));
}
const historyAction = z.object({ revision: z.uuid().nullable(), action: z.enum(['record', 'clear']) }).strict();
export async function postInventoryHistory(request: Request) {
  const { session, controller, player } = await context();
  const parsed = historyAction.safeParse(await jsonBody(request, 1024));
  if (!parsed.success) throw new AppError('Choose record or clear.', 400, 'INVALID_EQUIPMENT', true);
  const { revision, action } = parsed.data;
  if (action === 'clear')
    return json(historyView(await appendSnapshot(session.user.id, controller, player, revision, null)));
  // Check the revision before spending a scan, then again atomically on write.
  const current = await readHistory(session.user.id, controller, player);
  if (current.revision !== revision)
    throw new AppError('Saved equipment data changed. Refresh before trying again.', 409, 'EQUIPMENT_CONFLICT', true);
  await scanBudget(session.user.id);
  const observation = await collectInventory(session, { controller, player }, request.signal);
  const snapshot = summarizeSnapshot(observation, randomUUID(), new Date().toISOString());
  return json(historyView(await appendSnapshot(session.user.id, controller, player, revision, snapshot)));
}
