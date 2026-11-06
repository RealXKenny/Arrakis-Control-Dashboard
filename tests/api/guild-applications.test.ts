import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, LIST, REVIEW } from '../../src/modules/guilds/server/applications';
import { canonicalGuildQuestions, guildQuestionVersion } from '../../src/modules/guilds/question-fields';

const { session, linkedPlayer, request, redis } = vi.hoisted(() => ({
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  request: vi.fn(),
  redis: { get: vi.fn(), eval: vi.fn() },
}));
vi.mock('../../src/lib/security/session-store', () => ({ getSession: session }));
vi.mock('../../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
const req = (body?: unknown, query = {}) => ({
  url: '/api/guilds/2/application',
  query: { guildId: '2', ...query },
  headers: { cookie: 'dashboard_session=test', origin: 'http://localhost', host: 'localhost' },
  body,
});
const defaultQuestion = {
  id: '915c1a9c-13a6-4eef-833b-121c513f9a5a',
  label: 'Why would you like to join?',
  required: true,
  type: 'longText' as const,
};
const input = {
  answers: { [defaultQuestion.id]: 'I would like to help build and gather.' },
  questionVersion: guildQuestionVersion([defaultQuestion]),
};
const id = createHash('sha256').update('2:discord-user').digest('hex');
const application = {
  playStyle: 'Both',
  timezone: 'US Eastern',
  availability: 'Weekday evenings',
  experience: 'Explorer and builder',
  message: 'I would like to help build and gather.',
  id,
  discordId: 'discord-user',
  discordName: 'Discord Survivor',
  characterName: 'Survivor',
  submittedAt: 123456789,
  status: 'pending',
};

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'Discord Survivor' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Survivor' });
  request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
  redis.get.mockResolvedValue({
    guildName: 'Crimson Skies',
    requirements: 'Be friendly',
    contact: '',
    published: true,
    applicationQuestions: [defaultQuestion],
  });
  redis.eval.mockResolvedValue(1);
});

describe('guild applications', () => {
  it('requires an owner-configured form and validates typed answers on the server', async () => {
    redis.get.mockResolvedValue({ guildName: 'No form', requirements: 'Be friendly', contact: '', published: true });
    await expect(POST(req({ answers: {}, questionVersion: '[]' }), {})).rejects.toMatchObject({
      code: 'GUILD_APPLICATION_NOT_CONFIGURED',
    });
    const questions = [
      { ...defaultQuestion, type: 'timezone' as const },
      {
        ...defaultQuestion,
        id: '925c1a9c-13a6-4eef-833b-121c513f9a5a',
        type: 'dropdown' as const,
        options: ['PvE', 'PvP'],
      },
      { ...defaultQuestion, id: '935c1a9c-13a6-4eef-833b-121c513f9a5a', type: 'checkbox' as const },
      { ...defaultQuestion, id: '945c1a9c-13a6-4eef-833b-121c513f9a5a', type: 'number' as const },
    ];
    redis.get.mockResolvedValue({
      guildName: 'Custom form',
      requirements: 'Be friendly',
      contact: '',
      published: true,
      applicationQuestions: questions,
    });
    const valid = {
      questionVersion: guildQuestionVersion(questions),
      answers: {
        [questions[0].id]: 'Pacific/Auckland',
        [questions[1].id]: 'PvE',
        [questions[2].id]: true,
        [questions[3].id]: '9007199254740993123',
      },
    };
    for (const [index, value] of [
      [0, 'Invalid/Zone'],
      [1, 'Not an option'],
      [2, 'true'],
      [3, 'NaN'],
    ] as const)
      await expect(
        POST(req({ ...valid, answers: { ...valid.answers, [questions[index].id]: value } }), {}),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_GUILD_APPLICATION_ANSWERS' });
    const response = await POST(req(valid), {});
    expect(JSON.parse(response.body).data.customAnswers.map((answer) => answer.answer)).toEqual([
      'Pacific/Auckland',
      'PvE',
      true,
      '9007199254740993123',
    ]);
  });
  it('validates required custom answers and snapshots the server’s question wording', async () => {
    const question = {
      id: '915c1a9c-13a6-4eef-833b-121c513f9a5a',
      label: 'What would you contribute?',
      required: true,
    };
    const optional = { id: '925c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'Anything else?', required: false };
    const customInput = { answers: {}, questionVersion: guildQuestionVersion([question, optional]) };
    redis.get.mockResolvedValue({
      guildName: 'Crimson Skies',
      requirements: 'Be friendly',
      contact: '',
      published: true,
      applicationQuestions: [question, optional],
    });
    await expect(POST(req(input), {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'GUILD_APPLICATION_FORM_CHANGED',
    });
    await expect(POST(req(customInput), {})).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_GUILD_APPLICATION_ANSWERS',
    });
    await expect(POST(req({ ...customInput, answers: { [question.id]: '  ' } }), {})).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      POST(
        req({
          ...customInput,
          answers: { [question.id]: 'Building', '935c1a9c-13a6-4eef-833b-121c513f9a5a': 'Unknown question' },
        }),
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    const response = await POST(
      req({
        ...customInput,
        answers: { [question.id]: ' Building ' },
        customAnswers: [{ question: 'Forged prompt', answer: 'Forged answer' }],
      }),
      {},
    );
    const data = JSON.parse(response.body).data;
    expect(data.customAnswers).toEqual([
      { questionId: question.id, question: question.label, type: 'longText', answer: 'Building' },
      { questionId: optional.id, question: optional.label, type: 'longText', answer: '' },
    ]);
    expect(data.answers).toBeUndefined();
    expect(data.conversationId).toMatch(/^[a-f0-9-]{36}$/);
    redis.eval.mockResolvedValue(-4);
    await expect(POST(req({ ...customInput, answers: { [question.id]: 'Building' } }), {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'GUILD_APPLICATION_FORM_CHANGED',
    });
  });
  it('rejects missing or cross-site mutation origins before storing or reviewing answers', async () => {
    for (const origin of [undefined, 'https://other.example']) {
      const invalid = { ...req(input), headers: { cookie: 'dashboard_session=test', host: 'localhost', origin } };
      await expect(POST(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
      await expect(REVIEW(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('requires a dashboard session for every application operation', async () => {
    session.mockResolvedValue(null);
    for (const handler of [GET, POST, LIST, REVIEW])
      await expect(handler(req(input), {})).rejects.toMatchObject({ statusCode: 401 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('submits bounded answers with server-verified identity instead of submitted identity', async () => {
    const response = await POST(
      req({ ...input, discordId: 'forged', characterName: 'Forged', status: 'accepted' }),
      {},
    );
    expect(response.status).toBe(201);
    const data = JSON.parse(response.body).data;
    expect(data).toMatchObject({
      id,
      discordId: 'discord-user',
      characterName: 'Survivor',
      status: 'pending',
      submittedAt: expect.any(Number),
    });
    expect(data.playStyle).toBeUndefined();
    expect(data.timezone).toBeUndefined();
    expect(data.message).toBeUndefined();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HEXISTS'"),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2', 'arrakis:guild-requirements:2'],
      [
        id,
        JSON.stringify(data),
        -data.submittedAt,
        90 * 86400,
        JSON.stringify(canonicalGuildQuestions([defaultQuestion])),
      ],
    );
  });

  it('only reads the current user’s application even with another application ID in the query', async () => {
    redis.eval.mockResolvedValue(JSON.stringify({ ...application, secret: 'stripped' }));
    const response = await GET(req(undefined, { applicationId: 'another-user' }), {});
    expect(JSON.parse(response.body).data).toEqual(application);
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), ['arrakis:guild-applications:2'], [id]);
  });

  it('rejects closed listings, duplicate applications, full inboxes, and unlinked players', async () => {
    for (const [result, code] of [
      [-1, 'GUILD_NOT_RECRUITING'],
      [-2, 'GUILD_APPLICATION_EXISTS'],
      [-3, 'GUILD_APPLICATION_INBOX_FULL'],
    ] as const) {
      redis.eval.mockResolvedValue(result);
      await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 409, code });
    }
    redis.get.mockResolvedValue({ guildName: 'Closed', requirements: '', contact: '', published: false });
    await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 409, code: 'GUILD_NOT_RECRUITING' });
    redis.get.mockResolvedValue({
      guildName: 'Open',
      requirements: 'Be friendly',
      contact: '',
      published: true,
      applicationQuestions: [defaultQuestion],
    });
    linkedPlayer.mockResolvedValue({ linked: false });
    await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it('validates answers, IDs, and paging before accessing inbox data', async () => {
    for (const body of [
      { ...input, answers: { [defaultQuestion.id]: 'x'.repeat(1001) } },
      { ...input, answers: {} },
      { ...input, answers: { [defaultQuestion.id]: true } },
    ])
      await expect(POST(req(body), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(GET(req(undefined, { guildId: '../bad' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(LIST(req(undefined, { page: '10' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(REVIEW(req({ applicationId: id, status: 'owner' }), {})).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('keeps all applicants’ data and review actions restricted to that guild’s verified leader', async () => {
    request.mockResolvedValue({ rows: [{ player_id: 'other-player', role_id: '100' }] });
    await expect(LIST(req(), {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(REVIEW(req({ applicationId: id, status: 'accepted' }), {})).rejects.toMatchObject({ statusCode: 403 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('returns at most 20 normalized applications and supports recording decisions and removal', async () => {
    redis.eval.mockResolvedValue(
      Array.from({ length: 21 }, () => JSON.stringify({ ...application, secret: 'stripped' })),
    );
    const inbox = await LIST(req(undefined, { page: '1' }), {});
    expect(JSON.parse(inbox.body).data).toEqual({ rows: Array.from({ length: 20 }, () => application), hasMore: true });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZRANGE'"),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2'],
      [20, 40],
    );
    for (const status of ['accepted', 'declined']) {
      redis.eval.mockResolvedValue(JSON.stringify({ ...application, status }));
      const response = await REVIEW(req({ applicationId: id, status }), {});
      expect(JSON.parse(response.body).data.status).toBe(status);
    }
    redis.eval.mockResolvedValue('removed');
    expect(JSON.parse((await REVIEW(req({ applicationId: id, status: 'remove' }), {})).body).data).toBeNull();
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("redis.call('DEL', KEYS[3]"),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2', `arrakis:guild-chat:2:${id}`],
      [id, 'remove'],
    );
    redis.eval.mockResolvedValue(null);
    await expect(REVIEW(req({ applicationId: id, status: 'accepted' }), {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
