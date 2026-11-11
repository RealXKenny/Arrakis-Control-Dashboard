import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { countPinnedItems, itemPinsRecordSchema } from '../item-pins';
import { collectPinnedItems, resolveItemCharacter } from './item-finder';
import { readItemPins, saveItemPins } from './item-pins-store';

async function context() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:item-pins:${session.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed)
    throw new AppError('Pinned item request limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const { controller, player } = await resolveItemCharacter(session);
  return { session, controller, player };
}
export async function getItemPins() {
  const { session, controller, player } = await context();
  return json(await readItemPins(session.user.id, controller, player));
}
export async function putItemPins(request: Request) {
  assertSameOrigin(request);
  const { session, controller, player } = await context();
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new AppError('Send pinned items as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, 8192);
  if (!body) throw new AppError('Pinned item settings exceed the limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('Pinned item settings are invalid.', 400, 'INVALID_PINS', true);
  }
  const parsed = itemPinsRecordSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError('Choose up to 12 unique items with valid names and template IDs.', 400, 'INVALID_PINS', true);
  return json(await saveItemPins(session.user.id, controller, player, parsed.data.revision, parsed.data.pins));
}
export async function getItemPinReadings(request: Request) {
  const { session, controller, player } = await context();
  const record = await readItemPins(session.user.id, controller, player);
  const limit = await checkRateLimit(`v2:item-finder:${session.user.id}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed) throw new AppError('Search limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  if (!record.pins.length)
    return json({
      counters: [],
      revision: record.revision,
      coverage: { startedAt: new Date().toISOString(), sources: [], limited: false },
    });
  const reading = await collectPinnedItems(
    session,
    record.pins.map((pin) => pin.templateId),
    { controller, player },
    request.signal,
  );
  const { items: _items, ...coverage } = reading;
  return json({ counters: countPinnedItems(record.pins, reading), revision: record.revision, coverage });
}
