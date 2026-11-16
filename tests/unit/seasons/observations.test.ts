import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { seasonTemplate } from '../../../src/features/seasons/contracts';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';
const mock = vi.hoisted(() => ({
  reply: null as ReturnType<typeof createSeasonFixture>,
  linked: vi.fn(),
  request: vi.fn(),
  budget: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, ...args]: (string | number)[]) =>
      mock.reply(String(op), String(key), args.map(String))?.value,
    eval: async (script: string, keys: string[], args: (string | number)[]) =>
      mock.reply('EVAL', script, [String(keys.length), ...keys, ...args.map(String)])?.value,
  }),
}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mock.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mock.request }) }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: mock.budget }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mock.limit }));
import { verifyObjective, syncSeasonObjectives } from '../../../src/features/seasons/server/observations';
import { configureGenerator, runGenerator } from '../../../src/features/seasons/server/generator';
import { listSeasons, loadMember, readRecord, seasonKeys } from '../../../src/features/seasons/server/store';
import { saveSeason, transitionSeason, submitChallenge } from '../../../src/features/seasons/server/engine';
import { freshEvidence } from '../../../src/features/seasons/server/fresh-progress';
const session: DashboardSession = {
  user: { id: 'member' },
  guildId: 'guild',
  roleIds: [],
  expiresAt: Date.now() + 10000,
};
const player = { actorId: 42, controllerId: 43 };
let xp = 100000,
  level = 100,
  completed = false;
const journey = () => ({
  player,
  capabilities: { journey: true },
  rows: {
    story: [
      { id: 'historical', complete: true },
      ...Array.from({ length: 20 }, (_, i) => ({ id: `new.${i}`, complete: completed })),
    ],
    contract: [],
    codex: [],
    tutorial: [],
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.reply = createSeasonFixture();
  xp = 100000;
  level = 100;
  completed = false;
  mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43' });
  mock.budget.mockResolvedValue({ allowed: true });
  mock.limit.mockResolvedValue({ allowed: true });
  mock.request.mockImplementation(async (_method, path) =>
    path.endsWith('/journey') ? journey() : { player, capabilities: { progression: true }, level, xp },
  );
});
afterEach(() => vi.useRealTimers());
async function active() {
  await configureGenerator(
    '',
    { firstNumber: 1, firstStart: new Date(Date.now() - 1000).toISOString(), timezone: 'UTC' },
    'admin',
  );
  await runGenerator();
  return (await listSeasons(0, true)).find((s) => s.definition.number === 1)!;
}
const sync = (id: string) => syncSeasonObjectives(session, id, new AbortController().signal);
describe('new in-game progress, never historical achievements', () => {
  it('starts level-100 players with zero Season XP, then atomically awards only subsequent XP gains', async () => {
    const season = await active(),
      first = await sync(season.id);
    expect(first.trackingEstablished).toBe(true);
    expect(first.progress.xp).toBe(0);
    expect(first.progress.ledger).toHaveLength(0);
    expect(first.progress.claims).toHaveLength(1);
    expect((await sync(season.id)).progress.xp).toBe(0);
    xp += 20000;
    const earned = await sync(season.id);
    expect(earned.progress.xp).toBe(250000);
    expect(earned.progress.ledger).toHaveLength(100);
    expect(earned.progress.claims).toHaveLength(100);
    expect(earned.totals).toMatchObject({ participants: 1, completions: 100, claims: 100, xp: 250000 });
    expect((await sync(season.id)).duplicate).toBe(true);
    expect(mock.request.mock.calls.every((c) => c[0] === 'GET')).toBe(true);
  });
  it('supports capped players through newly completed journey nodes, and never pays for resetting/replaying a node', async () => {
    const season = await active();
    await sync(season.id);
    completed = true;
    const result = await sync(season.id);
    expect(result.tracking.newGameXp).toBe('0');
    expect(result.tracking.newJourneys).toBe(20);
    expect(result.progress.xp).toBe(250000);
    completed = false;
    await sync(season.id);
    completed = true;
    expect((await sync(season.id)).progress.ledger).toHaveLength(100);
  });
  it('does not treat newly visible completed nodes as new achievements', () => {
    const challenge = {
      ...seasonTemplate().challenges[0],
      verification: 'journey-node' as const,
      journeyNode: 'newly-visible',
    };
    const original = freshEvidence(
      [challenge],
      { pawn: '42', controller: '43' },
      new Map([['journey', journey()]]),
      null,
    );
    const payload = journey();
    payload.rows.story.push({ id: 'newly-visible', complete: true });
    const next = freshEvidence(
      [challenge],
      { pawn: '42', controller: '43' },
      new Map([['journey', payload]]),
      original.baseline,
    );
    expect(next.proofs.size).toBe(0);
  });
  it('never rebaselines on a counter decrease, unsafe counter or identity swap', async () => {
    const season = await active();
    await sync(season.id);
    const initial = (await readRecord(seasonKeys.baseline(season.id, 'member'))).raw;
    xp--;
    await expect(sync(season.id)).rejects.toThrow('decreased');
    expect((await readRecord(seasonKeys.baseline(season.id, 'member'))).raw).toBe(initial);
    xp = Number.MAX_SAFE_INTEGER + 1;
    await expect(sync(season.id)).rejects.toThrow('Exact game XP');
    xp = 100000;
    mock.linked
      .mockResolvedValueOnce({ linked: true, pawnId: '42', controllerId: '43' })
      .mockResolvedValueOnce({ linked: true, pawnId: '44', controllerId: '43' });
    await expect(sync(season.id)).rejects.toThrow('changed');
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(0);
    mock.linked.mockResolvedValue({ linked: true, pawnId: '44', controllerId: '43' });
    mock.request.mockImplementation(async (_m, path) =>
      path.endsWith('/journey')
        ? { ...journey(), player: { actorId: 44, controllerId: 43 } }
        : { player: { actorId: 44, controllerId: 43 }, capabilities: { progression: true }, xp, level },
    );
    await expect(sync(season.id)).rejects.toThrow('different character');
  });
  it('rejects unsupported, forged, ambiguous and oversized observations before any award', async () => {
    const season = await active();
    for (const patch of [
      { xp: '100000' },
      { xp: NaN },
      { capabilities: { progression: false } },
      { player: { actorId: 99, controllerId: 43 } },
      { ok: false },
    ]) {
      mock.request.mockImplementation(async (_m, path) =>
        path.endsWith('/journey') ? journey() : { player, capabilities: { progression: true }, xp, level, ...patch },
      );
      await expect(sync(season.id)).rejects.toThrow();
    }
    mock.request.mockResolvedValue({
      ...journey(),
      rows: {
        story: [
          { id: 'x', complete: true },
          { id: 'x', complete: true },
        ],
        contract: [],
        codex: [],
        tutorial: [],
      },
    });
    await expect(sync(season.id)).rejects.toThrow();
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(0);
  });
  it('serializes first-observation and progress races without duplicate XP or baseline replacement', async () => {
    const season = await active();
    await Promise.allSettled([sync(season.id), sync(season.id)]);
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(0);
    xp += 20000;
    await Promise.allSettled([sync(season.id), sync(season.id)]);
    expect((await loadMember(season.id, 'member')).progress.value.ledger).toHaveLength(100);
  });
  it('creates an independent Season 2 baseline and preserves Season 1 history', async () => {
    const season = await active();
    await sync(season.id);
    xp += 20000;
    await sync(season.id);
    const second = (await listSeasons(0, true)).find((s) => s.definition.number === 2)!;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(second.definition.startsAt);
    await runGenerator();
    const first = await sync(second.id);
    expect(first.progress.xp).toBe(0);
    expect(first.tracking.newGameXp).toBe('0');
    expect((await loadMember(season.id, 'member')).progress.value.claims).toHaveLength(100);
  });
  it('requires fresh threshold crossing for manual API objectives and rejects client evidence', async () => {
    const definition = seasonTemplate();
    definition.startsAt = new Date(Date.now() - 1000).toISOString();
    definition.challenges[0] = {
      ...definition.challenges[0],
      verification: 'character-level',
      cadence: 'once',
      minimumLevel: 10,
    };
    const draft = await saveSeason(randomUUID(), '', definition, 'admin');
    await transitionSeason(draft.id, draft.revision, 'publish', 'admin');
    level = 1;
    xp = 0;
    const verify = () => verifyObjective(session, draft.id, definition.challenges[0].id, new AbortController().signal);
    expect((await verify()).progress.xp).toBe(0);
    level = 12;
    xp = 1000;
    expect((await verify()).progress.xp).toBe(700);
    expect((await verify()).duplicate).toBe(true);
    await expect(
      submitChallenge(draft.id, 'other', definition.challenges[0].id, { text: 'I reached level 100', links: [] }),
    ).rejects.toThrow('verification');
  });
  it('fails closed on unavailable limiting storage', async () => {
    const season = await active();
    mock.limit.mockResolvedValue({ allowed: true, storageUnavailable: true });
    await expect(sync(season.id)).rejects.toThrow('limited');
    expect(mock.request).not.toHaveBeenCalled();
  });
});
