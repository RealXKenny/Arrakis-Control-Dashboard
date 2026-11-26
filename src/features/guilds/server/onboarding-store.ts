import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import { AppError } from '../../../lib/errors';
import {
  emptyOnboarding,
  onboardingBookSchema,
  onboardingGuildId,
  onboardingInputSchema,
  ONBOARDING_MEMBER_LIMIT,
  type OnboardingBook,
  type OnboardingInput,
} from '../onboarding';
import type { OnboardingActor } from './onboarding-access';

const MAX_BYTES = 262_144;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-onboarding-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
return redis.call('GET', KEYS[1]) or ''
`;
const SAVE = `
-- guild-onboarding-save
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
  local ok, book = pcall(cjson.decode, old)
  if not ok or type(book) ~= 'table' then return 'invalid' end
  if book.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'
`;
const unavailable = () =>
  new AppError('Guild onboarding is unavailable. Refresh before trying again.', 503, 'ONBOARDING_UNAVAILABLE', true);
const conflict = () =>
  new AppError(
    'Onboarding changed. Refresh before trying again. Your draft is kept.',
    409,
    'ONBOARDING_CONFLICT',
    true,
  );
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
export async function readOnboarding(guildId: string): Promise<OnboardingBook> {
  onboardingGuildId.parse(guildId);
  try {
    const raw = await storage().eval(READ, [guildKeys.onboarding(guildId)], [MAX_BYTES]);
    if (raw === '') return emptyOnboarding(guildId);
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) throw unavailable();
    const book = onboardingBookSchema.parse(JSON.parse(raw));
    if (book.guildId !== guildId) throw unavailable();
    return book;
  } catch {
    throw unavailable();
  }
}
export function onboardingView(book: OnboardingBook, actor: OnboardingActor) {
  const present = new Map(actor.roster.map((member) => [member.key, member.name]));
  const view = (member: OnboardingBook['members'][number]) => ({
    ...member,
    memberName: present.get(member.memberKey) ?? member.memberName,
    mentorName: member.mentorKey ? (present.get(member.mentorKey) ?? null) : null,
    currentMember: present.has(member.memberKey),
  });
  return {
    revision: book.revision,
    rulesRevision: book.rulesRevision,
    guide: book.guide,
    canEdit: actor.canEdit,
    self: book.members.find((member) => member.memberKey === actor.memberKey)
      ? view(book.members.find((member) => member.memberKey === actor.memberKey)!)
      : null,
    members: actor.canEdit ? book.members.map(view) : [],
    roster: actor.canEdit ? actor.roster : [],
  };
}
export async function mutateOnboarding(guildId: string, input: OnboardingInput, actor: OnboardingActor) {
  const change = onboardingInputSchema.parse(input);
  if (['guide', 'mentor', 'remove-progress'].includes(change.action) && !actor.canEdit)
    throw new AppError('Only the guild leader can manage onboarding.', 403, 'GUILD_LEADER_REQUIRED', true);
  const self = actor.roster.find((member) => member.key === actor.memberKey);
  if (!self) throw new AppError('Current guild membership is required.', 403, 'GUILD_MEMBER_REQUIRED', true);
  const current = await readOnboarding(guildId);
  if (current.revision !== change.revision) throw conflict();
  const next: OnboardingBook = {
    ...current,
    revision: randomUUID(),
    members: current.members.map((member) => ({ ...member, completed: [...member.completed] })),
  };
  if (change.action === 'guide') {
    next.guide = change.guide;
    if (current.guide.rules !== change.guide.rules) next.rulesRevision = change.guide.rules ? randomUUID() : null;
    const unchanged = new Set(
      change.guide.steps
        .filter((step) => current.guide.steps.some((old) => old.id === step.id && old.text === step.text))
        .map((step) => step.id),
    );
    next.members = next.members.map((member) => ({
      ...member,
      completed: member.completed.filter((id) => unchanged.has(id)),
    }));
  } else if (change.action === 'remove-progress') {
    if (!next.members.some((member) => member.memberKey === change.memberKey)) throw conflict();
    next.members = next.members.filter((member) => member.memberKey !== change.memberKey);
  } else {
    const targetKey = change.action === 'mentor' ? change.memberKey : actor.memberKey;
    const target = actor.roster.find((member) => member.key === targetKey);
    if (!target) throw new AppError('Choose a current guild member.', 409, 'ONBOARDING_MEMBER_CHANGED', true);
    if (
      change.action === 'mentor' &&
      change.mentorKey &&
      (change.mentorKey === targetKey || !actor.roster.some((member) => member.key === change.mentorKey))
    )
      throw new AppError('Choose another current guild member as mentor.', 409, 'ONBOARDING_MEMBER_CHANGED', true);
    let progress = next.members.find((member) => member.memberKey === targetKey);
    if (!progress) {
      if (next.members.length >= ONBOARDING_MEMBER_LIMIT)
        throw new AppError(
          'Keep at most 200 progress records. Remove an old record first.',
          409,
          'ONBOARDING_FULL',
          true,
        );
      progress = {
        memberKey: targetKey,
        memberName: target.name,
        mentorKey: null,
        completed: [],
        rulesRevision: null,
        updatedAt: new Date().toISOString(),
      };
      next.members.push(progress);
    }
    progress.memberName = target.name;
    progress.updatedAt = new Date().toISOString();
    if (change.action === 'mentor') progress.mentorKey = change.mentorKey;
    else if (change.action === 'complete') {
      if (!next.guide.steps.some((step) => step.id === change.stepId)) throw conflict();
      progress.completed = [
        ...progress.completed.filter((id) => id !== change.stepId),
        ...(change.completed ? [change.stepId] : []),
      ];
    } else {
      if (!next.guide.rules || !next.rulesRevision) throw conflict();
      progress.rulesRevision = next.rulesRevision;
    }
  }
  const encoded = JSON.stringify(onboardingBookSchema.parse(next));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('Onboarding storage is full.', 409, 'ONBOARDING_FULL', true);
  // Dev note: the spice must flow, but two recruits must not overwrite each other's homework.
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [guildKeys.onboarding(guildId)],
      [change.revision ?? '', encoded, RETENTION, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result !== 'ok') throw unavailable();
  return next;
}
