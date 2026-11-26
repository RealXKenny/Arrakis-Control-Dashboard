import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { getNumber } from '../../../lib/format';
import type { DashboardSession } from '../../auth/server/session-store';
import { extractBases, getBaseId } from '../../bases/view-model';
import { BaseValidationError, parseLayoutJson } from '../../bases/schema';
import { loadPortalProfile } from '../../portal/server/load';
import type { PortalProfile } from '../../portal/view-model';
import { collectBaseItems, resolveItemCharacter } from '../../player/server/item-finder';
import {
  DEFAULT_WATER_ALERT_PERCENT,
  UPKEEP_LIMITS,
  blueprintUploadSchema,
  upkeepActionSchema,
  type UpkeepAction,
} from '../model';
import { analyzeWater, buildCareInbox, compareMinimums, summarizeBlueprint, type CareBase } from '../care';
import { mutateUpkeep, readUpkeep, type UpkeepOwner } from './store';
import { listBaseContainers } from './base-access';
import { readWaterSamples, recordWaterSample } from './water-samples';

const MAX_BASES = 20;
const numericId = (value: string) => /^[1-9][0-9]{0,15}$/.test(value);

async function context(limit = 30): Promise<{ session: DashboardSession; owner: UpkeepOwner }> {
  const session = await requireApiSession();
  const allowed = await checkRateLimit(`v2:base-upkeep:${session.user.id}`, { limit, windowMs: 60_000 });
  if (!allowed.allowed || allowed.storageUnavailable)
    throw new AppError(
      'Base upkeep requests are temporarily limited.',
      allowed.storageUnavailable ? 503 : 429,
      'UPKEEP_LIMITED',
      true,
    );
  const { controller, player } = await resolveItemCharacter(session);
  return { session, owner: { userId: session.user.id, controller, player } };
}

async function readJson(request: Request, limit: number, label: string): Promise<unknown> {
  assertSameOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError(`Send ${label} as JSON.`, 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, limit);
  if (!body)
    throw new AppError(
      `${label[0].toUpperCase()}${label.slice(1)} exceed the request limit.`,
      413,
      'PAYLOAD_TOO_LARGE',
      true,
    );
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError(`Enter valid ${label}.`, 400, 'INVALID_UPKEEP', true);
  }
}

/** Generator runtime counts only when the Console reported a value; the portal gauge's zero default is not evidence. */
function generatorSeconds(raw: Record<string, unknown>): number | null {
  if (raw.generatorDataAvailable === false) return null;
  const value = getNumber(
    raw.generatorRuntimeSeconds,
    raw.generator_runtime_seconds,
    raw.generatorRuntime,
    raw.generator_runtime,
    raw.powerSeconds,
    raw.power_seconds,
  );
  return value === null || value < 0 ? null : value;
}

function careBases(profile: PortalProfile): { bases: CareBase[]; limited: boolean; unsupported: number } {
  const raw = new Map<string, Record<string, unknown>>();
  (extractBases({ details: profile.details }) as Array<Record<string, unknown>>).forEach((base, index) => {
    raw.set(String(getBaseId(base) ?? `base-${index}`), base);
  });
  const supported = profile.bases.filter((base) => numericId(base.id));
  return {
    bases: supported.slice(0, MAX_BASES).map((base) => ({
      id: base.id,
      name: base.name,
      owned: base.owned,
      water: { percent: base.water.percent, text: base.water.text },
      generatorSeconds: generatorSeconds(raw.get(base.id) ?? {}),
    })),
    limited: supported.length > MAX_BASES,
    unsupported: profile.bases.length - supported.length,
  };
}

async function authorizedBaseIds(session: DashboardSession): Promise<Set<string>> {
  const result = await loadPortalProfile(session);
  if (result.status === 'limited')
    throw new AppError('Read capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  if (result.status !== 'ok')
    throw new AppError('Your current bases could not be verified. Try again shortly.', 503, 'BASES_UNAVAILABLE', true);
  return new Set(careBases(result.profile).bases.map((base) => base.id));
}

/** Base-specific plans require the base to be in the member's current authorised profile. */
async function verifyAction(session: DashboardSession, owner: UpkeepOwner, action: UpkeepAction, signal: AbortSignal) {
  const baseId =
    action.action === 'base'
      ? action.base.baseId
      : action.action === 'inspect'
        ? action.baseId
        : action.action === 'reminder'
          ? action.reminder.baseId
          : action.action === 'relocation'
            ? action.relocation.fromBaseId
            : null;
  if (baseId && !(await authorizedBaseIds(session)).has(baseId))
    throw new AppError('That base is not in your current base list.', 403, 'BASE_FORBIDDEN', true);
  if (action.action === 'container') {
    const reading = await listBaseContainers(action.label.baseId, owner, signal);
    if (!reading.containers.some((entry) => entry.containerId === action.label.containerId))
      throw new AppError('Your character cannot currently open that container.', 403, 'CONTAINER_FORBIDDEN', true);
  }
}

export async function getUpkeep() {
  const { owner } = await context();
  return json({ record: await readUpkeep(owner) });
}

export async function postUpkeep(request: Request) {
  const raw = await readJson(request, UPKEEP_LIMITS.bodyBytes, 'upkeep details');
  const { session, owner } = await context();
  const parsed = upkeepActionSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Check the upkeep details and limits.', 400, 'INVALID_UPKEEP', true);
  await verifyAction(session, owner, parsed.data, request.signal);
  return json({ record: await mutateUpkeep(owner, parsed.data.revision, parsed.data) });
}

export async function postBlueprint(request: Request) {
  const raw = await readJson(request, 2 * 1024 * 1024 + UPKEEP_LIMITS.bodyBytes, 'blueprint details');
  const { owner } = await context(10);
  const parsed = blueprintUploadSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError('Check the revision name, description and file.', 400, 'INVALID_UPKEEP', true);
  let summary;
  try {
    summary = summarizeBlueprint(parseLayoutJson(parsed.data.layout));
  } catch (error) {
    if (error instanceof BaseValidationError) throw new AppError(error.message, 400, 'INVALID_BLUEPRINT', true);
    throw new AppError('The blueprint file could not be read.', 400, 'INVALID_BLUEPRINT', true);
  }
  const blueprint = { ...parsed.data.blueprint, summary, createdAt: new Date().toISOString() };
  return json({
    record: await mutateUpkeep(owner, parsed.data.revision, { action: 'blueprint-add', blueprint }),
  });
}

/** N021–N023 and N028: one fresh profile read, private plans and observed water history. */
export async function getOverview() {
  const { session, owner } = await context();
  const record = await readUpkeep(owner);
  const result = await loadPortalProfile(session);
  const checkedAt = new Date().toISOString();
  if (result.status !== 'ok')
    return json({
      status: result.status,
      checkedAt,
      message:
        result.status === 'limited'
          ? 'Read capacity reached. Try again shortly.'
          : result.status === 'unlinked'
            ? 'Link a character through the Discord bot to check your bases.'
            : result.message,
      record,
    });
  const now = Date.now();
  const observedAt = result.capturedAt ?? checkedAt;
  const { bases, limited, unsupported } = careBases(result.profile);
  const thresholds = new Map(record.bases.map((base) => [base.baseId, base.waterAlertPercent]));
  const water = await Promise.all(
    bases.map(async (base) => {
      await recordWaterSample(owner, base.id, base.water.percent, Date.parse(observedAt) || now);
      const samples = await readWaterSamples(owner, base.id, now);
      return {
        baseId: base.id,
        samples,
        analysis: samples ? analyzeWater(samples, thresholds.get(base.id) ?? DEFAULT_WATER_ALERT_PERCENT) : null,
      };
    }),
  );
  return json({
    status: 'ok',
    checkedAt,
    observedAt,
    bases,
    limited,
    unsupported,
    items: buildCareInbox(bases, record, now, observedAt),
    water,
    record,
  });
}

/** N025: compare one base's exact observed stacks with the member's private minimums. */
export async function getStockpile(request: Request) {
  const baseId = new URL(request.url).searchParams.get('base') ?? '';
  if (!numericId(baseId)) throw new AppError('Choose a supported base.', 400, 'INVALID_BASE', true);
  const { session, owner } = await context();
  const record = await readUpkeep(owner);
  const minimums = record.bases.find((base) => base.baseId === baseId)?.minimums ?? [];
  if (!minimums.length) return json({ baseId, revision: record.revision, lines: [], coverage: null });
  const limit = await checkRateLimit(`v2:item-finder:${session.user.id}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed) throw new AppError('Search limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const reading = await collectBaseItems(
    session,
    baseId,
    minimums.map((entry) => entry.templateId),
    owner,
    request.signal,
  );
  const { items: _items, ...coverage } = reading;
  return json({ baseId, revision: record.revision, lines: compareMinimums(minimums, reading), coverage });
}

/** N024: accessible container names for labelling. Contents are not read. */
export async function getContainers(request: Request) {
  const baseId = new URL(request.url).searchParams.get('base') ?? '';
  if (!numericId(baseId)) throw new AppError('Choose a supported base.', 400, 'INVALID_BASE', true);
  const { owner } = await context(10);
  return json(await listBaseContainers(baseId, owner, request.signal));
}
