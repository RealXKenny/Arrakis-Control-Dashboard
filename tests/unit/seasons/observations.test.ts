import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { seasonTemplate, type Challenge } from '../../../src/features/seasons/contracts';
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
import {
  observeObjective,
  verifyObjective,
  syncSeasonObjectives,
} from '../../../src/features/seasons/server/observations';
import { configureGenerator, runGenerator } from '../../../src/features/seasons/server/generator';
import { listSeasons } from '../../../src/features/seasons/server/store';
import { saveSeason, transitionSeason, submitChallenge } from '../../../src/features/seasons/server/engine';
import { loadMember } from '../../../src/features/seasons/server/store';

const expected = { pawn: '42', controller: '43' };
const player = { actorId: 42, controllerId: 43 };
const session: DashboardSession = {
  user: { id: 'member' },
  guildId: 'guild',
  roleIds: [],
  expiresAt: Date.now() + 10000,
};
const objective = (verification: Challenge['verification']): Challenge => ({
  ...seasonTemplate().challenges[0],
  cadence: 'once',
  verification,
  ...(verification === 'character-level' ? { minimumLevel: 10 } : { journeyNode: 'Journey.Story.Start' }),
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.reply = createSeasonFixture();
  mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43' });
  mock.budget.mockResolvedValue({ allowed: true });
  mock.limit.mockResolvedValue({ allowed: true });
});
describe('Console objective evidence', () => {
  it('observes the provider once for a full automatic track, then atomically claims cosmetics without client XP or game writes', async () => {
    await configureGenerator(
      '',
      { firstNumber: 1, firstStart: new Date(Date.now() - 60000).toISOString(), timezone: 'UTC' },
      'admin',
    );
    await runGenerator();
    const season = (await listSeasons(0, true)).find((s) => s.definition.number === 1)!;
    mock.request.mockResolvedValue({ player, capabilities: { progression: true }, level: 100 });
    const result = await syncSeasonObjectives(session, season.id, new AbortController().signal);
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(result.progress.xp).toBe(250000);
    expect(result.progress.claims).toHaveLength(100);
    expect(result.totals).toMatchObject({ participants: 1, completions: 100, claims: 100, xp: 250000 });
    expect(result.progress.ledger).toHaveLength(100);
    expect((await syncSeasonObjectives(session, season.id, new AbortController().signal)).duplicate).toBe(true);
    expect(mock.request.mock.calls.every((call) => call[0] === 'GET')).toBe(true);
  });
  it('accepts exact supported levels and exact completed canonical journey IDs', () => {
    expect(
      observeObjective(
        { player, capabilities: { progression: true }, level: 10 },
        objective('character-level'),
        expected,
      ),
    ).toContain('level 10');
    expect(
      observeObjective(
        {
          player,
          capabilities: { journey: true },
          rows: { story: [{ id: 'Journey.Story.Start', complete: true }], contract: [], codex: [], tutorial: [] },
        },
        objective('journey-node'),
        expected,
      ),
    ).toContain('complete');
  });
  it('fails closed for unsupported, wrong-character, unsafe and client-like levels', () => {
    for (const patch of [
      { level: 9 },
      { level: '100' },
      { level: NaN },
      { level: 1001 },
      { capabilities: { progression: false } },
      { player: { ...player, actorId: 99 } },
      { player: { ...player, controllerId: 9007199254740992 } },
      { ok: false },
    ])
      expect(() =>
        observeObjective(
          { player, capabilities: { progression: true }, level: 10, ...patch },
          objective('character-level'),
          expected,
        ),
      ).toThrow();
  });
  it('rejects missing groups, duplicates, display-name matches and truthy completion flags', () => {
    for (const rows of [
      { story: [] },
      {
        story: [{ id: 'another', name: 'Journey.Story.Start', complete: true }],
        contract: [],
        codex: [],
        tutorial: [],
      },
      { story: [{ id: 'Journey.Story.Start', complete: 'true' }], contract: [], codex: [], tutorial: [] },
      {
        story: [
          { id: 'Journey.Story.Start', complete: true },
          { id: 'Journey.Story.Start', complete: true },
        ],
        contract: [],
        codex: [],
        tutorial: [],
      },
    ])
      expect(() =>
        observeObjective({ player, capabilities: { journey: true }, rows }, objective('journey-node'), expected),
      ).toThrow();
  });
  it('uses fresh ownership and configured thresholds, with idempotent server-owned XP', async () => {
    const definition = seasonTemplate();
    definition.startsAt = new Date(Date.now() - 1000).toISOString();
    definition.challenges[0] = objective('character-level');
    const draft = await saveSeason(randomUUID(), '', definition, 'admin');
    await transitionSeason(draft.id, draft.revision, 'publish', 'admin');
    mock.request.mockResolvedValue({ player, capabilities: { progression: true }, level: 12 });
    const result = await verifyObjective(session, draft.id, definition.challenges[0].id, new AbortController().signal);
    expect(result.progress.xp).toBe(definition.challenges[0].xp);
    expect(mock.request).toHaveBeenCalledWith(
      'GET',
      '/api/players/42/progression',
      expect.objectContaining({ retryRead: false }),
    );
    expect(mock.linked).toHaveBeenCalledTimes(2);
    expect(
      (await verifyObjective(session, draft.id, definition.challenges[0].id, new AbortController().signal)).duplicate,
    ).toBe(true);
    expect((await loadMember(draft.id, 'member')).progress.value.ledger).toHaveLength(1);
    await expect(
      submitChallenge(draft.id, 'another', definition.challenges[0].id, { text: 'I am level 1000', links: [] }),
    ).rejects.toThrow('verification');
  });
  it('rejects link changes and unavailable rate-limit storage without awarding', async () => {
    const definition = seasonTemplate();
    definition.startsAt = new Date(Date.now() - 1000).toISOString();
    definition.challenges[0] = objective('journey-node');
    const draft = await saveSeason(randomUUID(), '', definition, 'admin');
    await transitionSeason(draft.id, draft.revision, 'publish', 'admin');
    mock.request.mockResolvedValue({
      player,
      capabilities: { journey: true },
      rows: { story: [{ id: 'Journey.Story.Start', complete: true }], contract: [], codex: [], tutorial: [] },
    });
    mock.linked
      .mockResolvedValueOnce({ linked: true, pawnId: '42', controllerId: '43' })
      .mockResolvedValueOnce({ linked: true, pawnId: '44', controllerId: '43' });
    await expect(
      verifyObjective(session, draft.id, definition.challenges[0].id, new AbortController().signal),
    ).rejects.toThrow('changed');
    expect((await loadMember(draft.id, 'member')).progress.value.xp).toBe(0);
    mock.limit.mockResolvedValue({ allowed: true, storageUnavailable: true });
    await expect(
      verifyObjective(session, draft.id, definition.challenges[0].id, new AbortController().signal),
    ).rejects.toThrow('limited');
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
});
