import '../../../lib/assert-server';
import { guildKeys } from '../../../lib/redis/keys';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../server/pages-api';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getGuildSession, queryValue, requireGuildMutationOrigin } from './common';
import { requireGuildLeader } from './leader';
import { addAcceptedApplicant, linkedGuildPlayerIds } from './acceptance';
import { guildApplicationInputSchema, guildApplicationReviewSchema, guildApplicationSchema } from '../applications';
import { guildRequirementSchema } from '../requirements';
import { canonicalGuildQuestions, guildAnswerError, guildQuestionType, guildQuestionVersion } from '../question-fields';

const TTL_SECONDS = 90 * 24 * 60 * 60;
export async function applicationContext(req, res) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const guildId = queryValue(req.query?.guildId);
  if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
    throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild application storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const id = createHash('sha256').update(`${guildId}:${session.user.id}`).digest('hex');
  return {
    session,
    guildId,
    redis,
    id,
    records: guildKeys.applications(guildId),
    index: guildKeys.applicationsIndex(guildId),
  };
}

export function parseStoredApplication(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = guildApplicationSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(req, res) {
  const ctx = await applicationContext(req, res);
  const value = await ctx.redis.eval("return redis.call('HGET', KEYS[1], ARGV[1])", [ctx.records], [ctx.id]);
  return NextResponse.json({ ok: true, data: parseStoredApplication(value) });
}

export async function POST(req, res) {
  const ctx = await applicationContext(req, res);
  requireGuildMutationOrigin(req);
  const input = guildApplicationInputSchema.safeParse(req.body);
  if (!input.success)
    throw new AppError(
      'Complete every application field within its character limit.',
      400,
      'INVALID_GUILD_APPLICATION',
      true,
    );
  const listing = guildRequirementSchema.safeParse(await ctx.redis.get(guildKeys.requirements(ctx.guildId)));
  if (!listing.success || !listing.data.published)
    throw new AppError('This guild is not accepting applications.', 409, 'GUILD_NOT_RECRUITING', true);
  const questions = listing.data.applicationQuestions ?? [];
  if (!questions.length)
    throw new AppError(
      'This guild has not set up its application questions yet.',
      409,
      'GUILD_APPLICATION_NOT_CONFIGURED',
      true,
    );
  if (
    (questions.length > 0 || input.data.questionVersion !== undefined) &&
    input.data.questionVersion !== guildQuestionVersion(questions)
  )
    throw new AppError(
      'This guild updated its application questions. Refresh Guilds and try again.',
      409,
      'GUILD_APPLICATION_FORM_CHANGED',
      true,
    );
  const answers = input.data.answers ?? {};
  const answerError = guildAnswerError(questions, answers);
  if (answerError) throw new AppError(answerError, 400, 'INVALID_GUILD_APPLICATION_ANSWERS', true);
  const player = await getLinkedPlayer({
    guildId: ctx.session.guildId,
    channelId: 'dashboard',
    userId: ctx.session.user.id,
    username: ctx.session.user.username,
    roleIds: ctx.session.roleIds,
    interactionId: `guild-apply-${ctx.guildId}`,
    commandName: 'portal',
  }).catch(() => {
    throw new AppError(
      'Your linked character could not be verified right now. Try again shortly.',
      503,
      'PLAYER_VERIFICATION_UNAVAILABLE',
      true,
    );
  });
  if (!linkedGuildPlayerIds(player).length || !player.characterName?.trim())
    throw new AppError('Link your character before applying to a guild.', 403, 'LINKED_PLAYER_REQUIRED', true);
  const application = guildApplicationSchema.parse({
    ...input.data,
    id: ctx.id,
    discordId: ctx.session.user.id,
    discordName: ctx.session.user.global_name || ctx.session.user.username || ctx.session.user.id,
    characterName: player.characterName,
    playerId: linkedGuildPlayerIds(player)[0],
    submittedAt: Date.now(),
    status: 'pending',
    conversationId: randomUUID(),
    customAnswers: questions.length
      ? questions.map((question) => ({
          questionId: question.id,
          question: question.label,
          type: guildQuestionType(question),
          answer: answers[question.id] ?? (guildQuestionType(question) === 'checkbox' ? false : ''),
        }))
      : undefined,
  });
  // Dev note: one application per survivor; even a sandworm cannot cut this queue twice.
  const result = await ctx.redis.eval(
    `
    local listing = redis.call('GET', KEYS[3])
    if not listing or not cjson.decode(listing).published then return -1 end
    local questions = cjson.decode(listing).applicationQuestions or {}
    local expected = cjson.decode(ARGV[5])
    if #questions ~= #expected then return -4 end
    for i, question in ipairs(questions) do
      if question.id ~= expected[i].id or question.label ~= expected[i].label or question.required ~= expected[i].required or (question.type or 'longText') ~= expected[i].type then return -4 end
      local choices = question.options or {}
      local expectedChoices = expected[i].options or {}
      if #choices ~= #expectedChoices then return -4 end
      for option, choice in ipairs(choices) do if choice ~= expectedChoices[option] then return -4 end end
    end
    if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return -2 end
    if redis.call('HLEN', KEYS[1]) >= 200 then return -3 end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
    redis.call('EXPIRE', KEYS[1], ARGV[4])
    redis.call('EXPIRE', KEYS[2], ARGV[4])
    return 1
  `,
    [ctx.records, ctx.index, guildKeys.requirements(ctx.guildId)],
    [
      ctx.id,
      JSON.stringify(application),
      -application.submittedAt,
      TTL_SECONDS,
      JSON.stringify(canonicalGuildQuestions(questions)),
    ],
  );
  if (Number(result) === -1)
    throw new AppError('This guild is not accepting applications.', 409, 'GUILD_NOT_RECRUITING', true);
  if (Number(result) === -2)
    throw new AppError('You have already applied to this guild.', 409, 'GUILD_APPLICATION_EXISTS', true);
  if (Number(result) === -4)
    throw new AppError(
      'This guild updated its application questions. Refresh Guilds and try again.',
      409,
      'GUILD_APPLICATION_FORM_CHANGED',
      true,
    );
  if (Number(result) !== 1)
    throw new AppError(
      'This guild’s application inbox is full. Contact the guild leader.',
      409,
      'GUILD_APPLICATION_INBOX_FULL',
      true,
    );
  return NextResponse.json({ ok: true, data: application }, { status: 201 });
}

export async function LIST(req, res) {
  const ctx = await applicationContext(req, res);
  await requireGuildLeader(req, res, ctx.guildId);
  const page = queryValue(req.query?.page) ?? '0';
  if (!/^\d{1,2}$/.test(page) || Number(page) > 9)
    throw new AppError('Invalid application page', 400, 'INVALID_GUILD_QUERY', true);
  const start = Number(page) * 20;
  const values = await ctx.redis.eval(
    `
    local ids = redis.call('ZRANGE', KEYS[2], ARGV[1], ARGV[2])
    local rows = {}
    for _, id in ipairs(ids) do
      local value = redis.call('HGET', KEYS[1], id)
      if value then table.insert(rows, value) end
    end
    return rows
  `,
    [ctx.records, ctx.index],
    [start, start + 20],
  );
  const rows = Array.isArray(values) ? values.map(parseStoredApplication).filter((value) => value !== null) : [];
  return NextResponse.json({ ok: true, data: { rows: rows.slice(0, 20), hasMore: rows.length > 20 } });
}

export async function REVIEW(req, res) {
  const ctx = await applicationContext(req, res);
  requireGuildMutationOrigin(req);
  const roster = await requireGuildLeader(req, res, ctx.guildId);
  const parsed = guildApplicationReviewSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid application review', 400, 'INVALID_GUILD_APPLICATION_REVIEW', true);
  const { applicationId, status } = parsed.data;
  const token = randomUUID();
  const lock = guildKeys.reviewLock(ctx.guildId, applicationId);
  const original = await ctx.redis.eval(
    `
    local value = redis.call('HGET', KEYS[1], ARGV[1])
    if not value then return false end
    if not redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', 120) then return -1 end
    return value
  `,
    [ctx.records, lock],
    [applicationId, token],
  );
  if (original === -1)
    throw new AppError(
      'This application is already being reviewed. Refresh and try again.',
      409,
      'GUILD_APPLICATION_BUSY',
      true,
    );
  if (!original) throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  try {
    const application = parseStoredApplication(original);
    if (
      !application ||
      application.id !== applicationId ||
      createHash('sha256').update(`${ctx.guildId}:${application.discordId}`).digest('hex') !== applicationId
    )
      throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
    if (status === 'declined' && application.status === 'accepted')
      throw new AppError(
        'This application is already accepted. Manage their membership in My Guild, or remove the application to archive it.',
        409,
        'GUILD_APPLICATION_ACCEPTED',
        true,
      );
    const assertCurrent = async () => {
      const current = await ctx.redis.eval(
        "return redis.call('GET', KEYS[2]) == ARGV[2] and redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[3] and 1 or 0",
        [ctx.records, lock],
        [applicationId, token, original as string],
      );
      if (current !== 1)
        throw new AppError(
          'This application changed. Refresh before trying again.',
          409,
          'GUILD_APPLICATION_CHANGED',
          true,
        );
    };
    if (status === 'accepted') await addAcceptedApplicant(ctx.session, ctx.guildId, application, roster, assertCurrent);
    const value = await ctx.redis
      .eval(
        `
      if redis.call('GET', KEYS[4]) ~= ARGV[3] then return false end
      local value = redis.call('HGET', KEYS[1], ARGV[1])
      if not value or value ~= ARGV[4] then return false end
      local application = cjson.decode(value)
      if ARGV[2] == 'remove' then
        local chatKey = KEYS[3] .. ':' .. (application.conversationId or tostring(application.submittedAt))
        redis.call('DEL', chatKey, chatKey .. ':seen')
        redis.call('HDEL', KEYS[1], ARGV[1])
        redis.call('ZREM', KEYS[2], ARGV[1])
        return 'removed'
      end
      application.status = ARGV[2]
      local updated = cjson.encode(application)
      redis.call('HSET', KEYS[1], ARGV[1], updated)
      return updated
    `,
        [ctx.records, ctx.index, `${guildKeys.chatPrefix(ctx.guildId)}${applicationId}`, lock],
        [applicationId, status, token, original as string],
      )
      .catch(() => {
        throw new AppError(
          status === 'accepted'
            ? 'Guild membership was confirmed, but the application status could not be saved. Refresh the guild and application before trying again.'
            : 'The review could not be saved. Refresh the application before trying again.',
          503,
          'GUILD_APPLICATION_SAVE_UNAVAILABLE',
          true,
        );
      });
    if (!value)
      throw new AppError(
        'The application changed while reviewing it. Membership may already have changed; refresh the guild and application before trying again.',
        409,
        'GUILD_APPLICATION_CHANGED',
        true,
      );
    return NextResponse.json({ ok: true, data: value === 'removed' ? null : parseStoredApplication(value) });
  } finally {
    await ctx.redis
      .eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
        [lock],
        [token],
      )
      .catch(() => {
        /* The short lease expires if storage is temporarily unavailable. */
      });
  }
}
