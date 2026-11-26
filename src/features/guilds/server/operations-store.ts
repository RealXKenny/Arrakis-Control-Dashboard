import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import {
  OPERATION_FOLLOW_UP_LIMIT,
  OPERATION_LIMIT,
  OPERATION_SCREENSHOT_LIMIT,
  OPERATION_WAITLIST_LIMIT,
  memberOperationActions,
  operationGuildIdSchema,
  operationInputSchema,
  operationOpen,
  operationReviewable,
  operationSettlementChanged,
  settleOperation,
  storedOperationSchema,
  type OperationInput,
  type StoredOperation,
} from '../operations';

const MAX_BYTES = 65_536;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-operations-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `
-- guild-operations-save
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local ok, operation = pcall(cjson.decode, old)
  if not ok or type(operation) ~= 'table' then return 'invalid' end
  if operation.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict'
elseif redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1])
else redis.call('EXPIRE', KEYS[1], math.max(redis.call('TTL', KEYS[1]), tonumber(ARGV[6]))) end
return 'ok'
`;
/**
 * Screenshot changes commit the operation record and its images together. Image fields are
 * `<operation>:<screenshot>` inside one per-guild hash so disband cleanup removes a single key.
 */
const SAVE_MEDIA = `
-- guild-operations-save-media
local old = redis.call('HGET', KEYS[1], ARGV[1])
if not old then return 'conflict' end
local ok, operation = pcall(cjson.decode, old)
if not ok or type(operation) ~= 'table' then return 'invalid' end
if operation.revision ~= ARGV[2] then return 'conflict' end
if ARGV[7] ~= '' and redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[9]) then return 'full' end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if ARGV[7] ~= '' then redis.call('HSET', KEYS[2], ARGV[7], ARGV[8]) end
for index = 10, #ARGV do redis.call('HDEL', KEYS[2], ARGV[index]) end
for _, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 then
    if redis.call('HLEN', key) == 0 then redis.call('DEL', key)
    else redis.call('EXPIRE', key, math.max(redis.call('TTL', key), tonumber(ARGV[6]))) end
  end
end
return 'ok'
`;
function unavailable() {
  return new AppError(
    'Guild operations storage is unavailable. Refresh before trying again.',
    503,
    'OPERATIONS_UNAVAILABLE',
    true,
  );
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
const conflict = () =>
  new AppError(
    'This operation changed. Refresh before trying again. Your draft is kept.',
    409,
    'OPERATIONS_CONFLICT',
    true,
  );
const closed = () =>
  new AppError(
    'This operation has started or is closed. Sign-ups and schedule changes are unavailable.',
    409,
    'OPERATION_CLOSED',
    true,
  );
const notReviewable = () =>
  new AppError(
    'After-action reports open once the operation is completed, cancelled or past its scheduled end.',
    409,
    'OPERATION_NOT_REVIEWABLE',
    true,
  );
const forbidden = (message: string) => new AppError(message, 403, 'OPERATION_FORBIDDEN', true);

export async function readGuildOperations(guildId: string): Promise<StoredOperation[]> {
  operationGuildIdSchema.parse(guildId);
  try {
    const values = await storage().eval(READ, [guildKeys.operations(guildId)], [OPERATION_LIMIT, MAX_BYTES]);
    if (!Array.isArray(values) || values.length > OPERATION_LIMIT * 2 || values.length % 2) throw unavailable();
    const operations: StoredOperation[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index + 1] !== 'string' || values[index + 1].length > MAX_BYTES) throw unavailable();
      const parsed = storedOperationSchema.parse(JSON.parse(values[index + 1]));
      if (parsed.id !== values[index]) throw unavailable();
      operations.push(parsed);
    }
    return operations.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  } catch {
    throw unavailable();
  }
}

function retention(operation: StoredOperation, now: number) {
  return Math.max(RETENTION, Math.ceil((Date.parse(operation.endsAt) - now) / 1000) + RETENTION);
}

function encode(operation: StoredOperation) {
  const encoded = JSON.stringify(storedOperationSchema.parse(operation));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('This operation has reached its storage limit.', 409, 'OPERATION_FULL', true);
  return encoded;
}

/**
 * Member-facing read: expired invitations lapse and free seats are offered to waiters. A changed
 * settlement is persisted once with the record's own revision, so the offer's expiry is fixed when it
 * is first shown. A concurrent change simply wins; the next read settles again.
 */
export async function readSettledOperations(guildId: string, now = Date.now()): Promise<StoredOperation[]> {
  const operations = await readGuildOperations(guildId);
  return Promise.all(
    operations.map(async (operation) => {
      const settled = settleOperation(operation, now);
      if (!operationSettlementChanged(operation, settled)) return settled;
      const next = { ...settled, revision: randomUUID() };
      try {
        const result = await storage().eval(
          SAVE,
          [guildKeys.operations(guildId)],
          [operation.id, operation.revision, encode(next), 'settle', OPERATION_LIMIT, retention(next, now)],
        );
        return result === 'ok' ? next : operation;
      } catch {
        return operation;
      }
    }),
  );
}

type Actor = { memberId: string; authorName: string; canEdit: boolean };
type Screenshot = { id: string; caption: string; bytes: Buffer };

function applyChange(existing: StoredOperation | undefined, change: OperationInput, actor: Actor, now: number) {
  const timestamp = new Date(now).toISOString();
  if (change.action === 'save') {
    if (existing && !operationOpen(existing, now)) throw closed();
    if (Date.parse(change.operation.startsAt) <= now || Date.parse(change.operation.startsAt) > now + 365 * 86_400_000)
      throw new AppError('Choose a future start within the next year.', 400, 'INVALID_OPERATION_TIME', true);
    const holders = [...(existing?.signups ?? []), ...(existing?.invitations ?? [])];
    if (
      holders.some((entry) => !change.operation.roles.some((slot) => slot.role === entry.role)) ||
      change.operation.roles.some((slot) => holders.filter((entry) => entry.role === slot.role).length > slot.capacity)
    )
      throw new AppError(
        'Remove or reassign sign-ups before reducing occupied role slots.',
        409,
        'OPERATION_CAPACITY_CONFLICT',
        true,
      );
    const prep = new Set((change.operation.preparation ?? []).map((entry) => entry.id));
    const waypoints = new Set((change.operation.waypoints ?? []).map((entry) => entry.id));
    return {
      ...change.operation,
      revision: randomUUID(),
      status: 'scheduled' as const,
      organizerName: existing?.organizerName ?? actor.authorName,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      // Readiness ticks for removed preparation items no longer mean anything.
      signups: (existing?.signups ?? []).map((entry) =>
        entry.readiness
          ? {
              ...entry,
              readiness: { ...entry.readiness, checked: entry.readiness.checked.filter((id) => prep.has(id)) },
            }
          : entry,
      ),
      waitlist: (existing?.waitlist ?? []).filter((entry) =>
        change.operation.roles.some((slot) => slot.role === entry.role),
      ),
      invitations: existing?.invitations ?? [],
      convoy: (existing?.convoy ?? []).map((entry) => ({
        ...entry,
        waypointId: entry.waypointId && waypoints.has(entry.waypointId) ? entry.waypointId : null,
      })),
      report: existing?.report ?? null,
      followUps: existing?.followUps ?? [],
      screenshots: existing?.screenshots ?? [],
    } satisfies StoredOperation;
  }
  if (!existing) throw conflict();
  const next: StoredOperation = { ...existing, revision: randomUUID(), updatedAt: timestamp };
  const own = existing.signups.find((entry) => entry.memberId === actor.memberId);
  const invitations = existing.invitations ?? [];
  const waitlist = existing.waitlist ?? [];
  const occupied = (role: string, exceptMember?: string) =>
    existing.signups.filter((entry) => entry.role === role && entry.memberId !== exceptMember).length +
    invitations.filter((entry) => entry.role === role && entry.memberId !== exceptMember).length;
  const withoutMember = () => {
    next.signups = existing.signups.filter((entry) => entry.memberId !== actor.memberId);
    next.invitations = invitations.filter((entry) => entry.memberId !== actor.memberId);
    next.waitlist = waitlist.filter((entry) => entry.memberId !== actor.memberId);
  };
  switch (change.action) {
    case 'status':
      if (existing.status !== 'scheduled') throw closed();
      next.status = change.status;
      break;
    case 'join':
    case 'leave':
      if (!operationOpen(existing, now)) throw closed();
      withoutMember();
      if (change.action === 'join') {
        const slot = existing.roles.find((entry) => entry.role === change.role);
        const invited = invitations.find((entry) => entry.memberId === actor.memberId && entry.role === change.role);
        if (!slot || (!invited && occupied(change.role, actor.memberId) >= slot.capacity))
          throw new AppError(
            'That role is full or unavailable. Join its waitlist or choose another role after refreshing.',
            409,
            'OPERATION_ROLE_FULL',
            true,
          );
        next.signups.push({
          id: own?.id ?? randomUUID(),
          memberId: actor.memberId,
          name: actor.authorName,
          role: change.role,
          signedUpAt: timestamp,
          ...(own?.readiness ? { readiness: own.readiness } : {}),
        });
      }
      break;
    case 'remove-signup':
      if (!existing.signups.some((entry) => entry.id === change.signupId)) throw conflict();
      next.signups = existing.signups.filter((entry) => entry.id !== change.signupId);
      next.convoy = (existing.convoy ?? []).map((entry) => ({
        ...entry,
        crew: entry.crew.filter((id) => id !== change.signupId),
      }));
      break;
    case 'waitlist-join': {
      if (!operationOpen(existing, now)) throw closed();
      const slot = existing.roles.find((entry) => entry.role === change.role);
      if (!slot) throw new AppError('That role is not part of this operation.', 409, 'OPERATION_ROLE_FULL', true);
      if (own?.role === change.role)
        throw new AppError('You already hold this role.', 409, 'OPERATION_WAITLIST_INVALID', true);
      if (occupied(change.role, actor.memberId) < slot.capacity)
        throw new AppError(
          'A seat is open for this role. Join it directly instead of waiting.',
          409,
          'OPERATION_WAITLIST_INVALID',
          true,
        );
      next.waitlist = waitlist.filter((entry) => entry.memberId !== actor.memberId);
      next.invitations = invitations.filter((entry) => entry.memberId !== actor.memberId);
      if (next.waitlist.length >= OPERATION_WAITLIST_LIMIT)
        throw new AppError('This waitlist is full.', 409, 'OPERATION_WAITLIST_FULL', true);
      next.waitlist.push({
        id: waitlist.find((entry) => entry.memberId === actor.memberId)?.id ?? randomUUID(),
        memberId: actor.memberId,
        name: actor.authorName,
        role: change.role,
        joinedAt: timestamp,
      });
      break;
    }
    case 'waitlist-leave':
      if (!operationOpen(existing, now)) throw closed();
      if (!waitlist.some((entry) => entry.memberId === actor.memberId)) throw conflict();
      next.waitlist = waitlist.filter((entry) => entry.memberId !== actor.memberId);
      break;
    case 'invitation': {
      if (!operationOpen(existing, now)) throw closed();
      const invitation = invitations.find((entry) => entry.memberId === actor.memberId);
      if (!invitation || Date.parse(invitation.expiresAt) <= now)
        throw new AppError(
          'This invitation is no longer available. Refresh to see the current seats.',
          409,
          'OPERATION_INVITATION_EXPIRED',
          true,
        );
      withoutMember();
      if (change.decision === 'accept')
        next.signups.push({
          id: own?.id ?? randomUUID(),
          memberId: actor.memberId,
          name: actor.authorName,
          role: invitation.role,
          signedUpAt: timestamp,
          ...(own?.readiness ? { readiness: own.readiness } : {}),
        });
      else if (own) next.signups.push(own);
      break;
    }
    case 'readiness': {
      if (existing.status === 'cancelled' || Date.parse(existing.endsAt) <= now) throw closed();
      if (!own) throw forbidden('Only members signed up for this operation can share readiness.');
      const prep = new Set((existing.preparation ?? []).map((entry) => entry.id));
      if (change.readiness && change.readiness.checked.some((id) => !prep.has(id)))
        throw new AppError(
          'The preparation list changed. Refresh before trying again.',
          409,
          'OPERATIONS_CONFLICT',
          true,
        );
      next.signups = existing.signups.map((entry) => {
        if (entry.memberId !== actor.memberId) return entry;
        const { readiness: _removed, ...rest } = entry;
        void _removed;
        return change.readiness
          ? {
              ...rest,
              readiness: {
                ...change.readiness,
                checked: [...new Set(change.readiness.checked)],
                updatedAt: timestamp,
              },
            }
          : rest;
      });
      break;
    }
    case 'convoy': {
      if (existing.status === 'cancelled' || Date.parse(existing.endsAt) <= now) throw closed();
      const signups = new Set(existing.signups.map((entry) => entry.id));
      const waypoints = new Set((existing.waypoints ?? []).map((entry) => entry.id));
      if (
        change.convoy.some(
          (entry) =>
            entry.crew.some((id) => !signups.has(id)) ||
            (entry.waypointId !== null && !waypoints.has(entry.waypointId)),
        )
      )
        throw new AppError(
          'Convoy crews must be current sign-ups and destinations must be this operation’s waypoints.',
          409,
          'OPERATION_CONVOY_INVALID',
          true,
        );
      next.convoy = change.convoy;
      break;
    }
    case 'report':
      if (!operationReviewable(existing, now)) throw notReviewable();
      next.report = { ...change.report, authorName: actor.authorName, updatedAt: timestamp };
      break;
    case 'follow-up': {
      if (!operationReviewable(existing, now)) throw notReviewable();
      if (!own && !actor.canEdit) throw forbidden('Only participants and guild leaders can propose follow-up tasks.');
      const followUps = existing.followUps ?? [];
      if (followUps.length >= OPERATION_FOLLOW_UP_LIMIT)
        throw new AppError('This report has reached its follow-up limit.', 409, 'OPERATION_FOLLOW_UPS_FULL', true);
      next.followUps = [
        ...followUps,
        {
          id: randomUUID(),
          text: change.text,
          status: 'proposed',
          proposedBy: actor.authorName,
          proposedAt: timestamp,
          reviewedAt: null,
        },
      ];
      break;
    }
    case 'follow-up-review': {
      const followUps = existing.followUps ?? [];
      const target = followUps.find((entry) => entry.id === change.followUpId);
      if (!target) throw conflict();
      if (change.status === 'done' && target.status !== 'accepted')
        throw new AppError('Accept a follow-up before marking it done.', 409, 'OPERATION_FOLLOW_UP_INVALID', true);
      next.followUps = followUps.map((entry) =>
        entry.id === change.followUpId ? { ...entry, status: change.status, reviewedAt: timestamp } : entry,
      );
      break;
    }
    case 'screenshot-remove': {
      const shot = (existing.screenshots ?? []).find((entry) => entry.id === change.screenshotId);
      if (!shot) throw conflict();
      if (!actor.canEdit && shot.uploaderId !== actor.memberId)
        throw forbidden('Only the uploader or a guild leader can remove this screenshot.');
      next.screenshots = (existing.screenshots ?? []).filter((entry) => entry.id !== change.screenshotId);
      break;
    }
    case 'delete':
      break;
  }
  return next;
}

async function commit(
  guildId: string,
  id: string,
  revision: string | null,
  action: string,
  next: StoredOperation,
  now: number,
  media?: { add?: { field: string; value: string }; remove: string[] },
) {
  const encoded = encode(next);
  // Dev note: the last ornithopter seat gets one atomic reservation, not a duel at the boarding ramp.
  let result: unknown;
  try {
    result = media
      ? await storage().eval(
          SAVE_MEDIA,
          [guildKeys.operations(guildId), guildKeys.operationScreenshots(guildId)],
          [
            id,
            revision ?? '',
            encoded,
            action,
            OPERATION_LIMIT,
            retention(next, now),
            media.add?.field ?? '',
            media.add?.value ?? '',
            OPERATION_LIMIT * OPERATION_SCREENSHOT_LIMIT,
            ...media.remove,
          ],
        )
      : await storage().eval(
          SAVE,
          [guildKeys.operations(guildId)],
          [id, revision ?? '', encoded, action, OPERATION_LIMIT, retention(next, now)],
        );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'full')
    throw new AppError(
      `Keep at most ${OPERATION_LIMIT} operations. Remove an older one first.`,
      409,
      'OPERATIONS_FULL',
      true,
    );
  if (result !== 'ok') throw unavailable();
}

export async function mutateGuildOperation(guildId: string, input: OperationInput, actor: Actor) {
  operationGuildIdSchema.parse(actor.memberId);
  const change = operationInputSchema.parse(input);
  if (!memberOperationActions.has(change.action) && !actor.canEdit)
    throw new AppError('Only the guild leader can manage operations.', 403, 'GUILD_LEADER_REQUIRED', true);
  const operations = await readGuildOperations(guildId);
  const id = change.action === 'save' ? change.operation.id : change.id;
  const stored = operations.find((operation) => operation.id === id);
  if ((stored?.revision ?? null) !== change.revision) throw conflict();
  const now = Date.now();
  // Settle first so expired offers never block a seat, then again so a freed seat is offered at once.
  const existing = stored ? settleOperation(stored, now) : undefined;
  const next = settleOperation(applyChange(existing, change, actor, now), now);
  const field = (screenshotId: string) => `${id}:${screenshotId}`;
  if (change.action === 'delete' || change.action === 'screenshot-remove') {
    const removed =
      change.action === 'delete'
        ? (stored?.screenshots ?? []).map((entry) => field(entry.id))
        : [field(change.screenshotId)];
    await commit(
      guildId,
      id,
      change.revision,
      change.action,
      next,
      now,
      removed.length ? { remove: removed } : undefined,
    );
  } else await commit(guildId, id, change.revision, change.action, next, now);
  return change.action === 'delete' ? null : next;
}

/** Adds one already re-encoded WebP screenshot to an operation's after-action report. */
export async function addOperationScreenshot(
  guildId: string,
  operationId: string,
  revision: string,
  screenshot: Screenshot,
  actor: Actor,
) {
  const operations = await readGuildOperations(guildId);
  const stored = operations.find((operation) => operation.id === operationId);
  if (!stored || stored.revision !== revision) throw conflict();
  const now = Date.now();
  if (!operationReviewable(stored, now)) throw notReviewable();
  if (!actor.canEdit && !stored.signups.some((entry) => entry.memberId === actor.memberId))
    throw forbidden('Only participants and guild leaders can add after-action screenshots.');
  if ((stored.screenshots ?? []).length >= OPERATION_SCREENSHOT_LIMIT)
    throw new AppError(
      `Keep at most ${OPERATION_SCREENSHOT_LIMIT} screenshots per report.`,
      409,
      'OPERATION_SCREENSHOTS_FULL',
      true,
    );
  const timestamp = new Date(now).toISOString();
  const next: StoredOperation = {
    ...settleOperation(stored, now),
    revision: randomUUID(),
    updatedAt: timestamp,
    screenshots: [
      ...(stored.screenshots ?? []),
      {
        id: screenshot.id,
        caption: screenshot.caption,
        uploadedBy: actor.authorName,
        uploaderId: actor.memberId,
        uploadedAt: timestamp,
      },
    ],
  };
  await commit(guildId, operationId, revision, 'screenshot', next, now, {
    add: { field: `${operationId}:${screenshot.id}`, value: screenshot.bytes.toString('base64') },
    remove: [],
  });
  return next;
}

export async function readOperationScreenshot(guildId: string, operationId: string, screenshotId: string) {
  let raw: unknown;
  try {
    raw = await storage().command(['HGET', guildKeys.operationScreenshots(guildId), `${operationId}:${screenshotId}`]);
  } catch {
    throw unavailable();
  }
  if (typeof raw !== 'string' || raw.length > 400_000) return null;
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP')
    return null;
  return bytes;
}
