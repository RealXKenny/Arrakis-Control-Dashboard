import { describe, expect, it } from 'vitest';
import { assertSingleSlot, keySlot } from '../../../src/lib/redis/connection';
import { baseKeys, guildKeys, solidoKeys } from '../../../src/lib/redis/keys';
import { rekeyName, runRekey } from '../../../scripts/maintenance/rekey-rules.mjs';

const g = '987654321';
const app = 'a'.repeat(64);
const gen = '1730000000000';

describe('legacy -> new key names match the key builders', () => {
  const cases: Array<[string, string]> = [
    [`arrakis:guild-applications:${g}`, guildKeys.applications(g)],
    [`arrakis:guild-applications-index:${g}`, guildKeys.applicationsIndex(g)],
    [`arrakis:guild-requirements:${g}`, guildKeys.requirements(g)],
    ['arrakis:guild-requirements', guildKeys.requirementsIndex],
    [`arrakis:guild-logo:${g}`, guildKeys.logo(g)],
    [`arrakis:guild-support:${g}`, guildKeys.support(g)],
    ['arrakis:guild-support-unread', guildKeys.supportUnread],
    [`arrakis:guild-chat:${g}:${app}:${gen}`, guildKeys.chat(g, app, gen)],
    [`arrakis:guild-chat:${g}:${app}:${gen}:seen`, `${guildKeys.chat(g, app, gen)}:seen`],
    [`arrakis:guild-application-review:${g}:${app}`, guildKeys.reviewLock(g, app)],
    ['arrakis:solido:456084885220884480:2026-11-07', solidoKeys.history('456084885220884480', '2026-11-07')],
    ['arrakis:solido:operation:456084885220884480:op-1', solidoKeys.operation('456084885220884480', 'op-1')],
    ['arrakis:base-preview:' + 'f'.repeat(24), baseKeys.preview('f'.repeat(24))],
    ['arrakis:base-marketplace:listing:' + 'f'.repeat(24), baseKeys.listing('f'.repeat(24))],
    ['arrakis:base-marketplace:summary-state:' + 'f'.repeat(24), baseKeys.summaryState('f'.repeat(24))],
    ['arrakis:base-marketplace:listings', baseKeys.listings],
  ];
  it.each(cases)('%s', (legacy, current) => {
    expect(rekeyName(legacy)).toBe(current);
    // Idempotent: a migrated key is never migrated again.
    expect(rekeyName(current)).toBeNull();
  });

  it('leaves single-key data alone', () => {
    for (const key of [
      'arrakis:session:abc',
      'arrakis:rate:abc',
      'arrakis:population:abc',
      'arrakis:dashboard:snapshot:haggabasin',
      'arrakis:{bm}:v2:index',
    ]) {
      expect(rekeyName(key), key).toBeNull();
    }
  });
});

describe('every multi-key script keeps its keys in one hash slot', () => {
  it('guild scripts, including keys that scripts derive from a prefix', () => {
    const keys = [
      guildKeys.applications(g),
      guildKeys.applicationsIndex(g),
      guildKeys.requirements(g),
      guildKeys.requirementsIndex,
      guildKeys.logo(g),
      guildKeys.support(g),
      guildKeys.supportUnread,
      guildKeys.chat(g, app, gen),
      `${guildKeys.chat(g, app, gen)}:seen`,
      `${guildKeys.chatPrefix(g)}${app}`,
      guildKeys.reviewLock(g, app),
      // Support scripts touch several guilds at once (admin unread overview).
      guildKeys.support('1'),
      guildKeys.support('2'),
    ];
    expect(() => assertSingleSlot(keys)).not.toThrow();
  });

  it('base-import ledger and marketplace/preview scripts', () => {
    expect(() =>
      assertSingleSlot([solidoKeys.history('42', '2026-11-07'), solidoKeys.operation('42', 'op')]),
    ).not.toThrow();
    const id = 'c'.repeat(24);
    expect(() =>
      assertSingleSlot([baseKeys.preview(id), baseKeys.listing(id), baseKeys.summaryState(id), baseKeys.listings]),
    ).not.toThrow();
  });

  it('different members spread across slots', () => {
    expect(keySlot(solidoKeys.history('1', '2026-11-07'))).not.toBe(keySlot(solidoKeys.history('2', '2026-11-07')));
  });

  it('the old names really were cross-slot (why this migration exists)', () => {
    expect(() =>
      assertSingleSlot([`arrakis:guild-applications:${g}`, `arrakis:guild-applications-index:${g}`]),
    ).toThrow();
  });
});

describe('rekey runner', () => {
  function fakeRedis(initial: string[]) {
    const keys = new Set(initial);
    let snapshot: string[] = [];
    return {
      keys,
      async scan(cursor: string) {
        // Like real SCAN, every key present for the whole iteration is returned exactly once.
        if (cursor === '0') snapshot = [...keys];
        return cursor === '0' ? ['1', snapshot.slice(0, 2)] : ['0', snapshot.slice(2)];
      },
      async renamenx(from: string, to: string) {
        if (!keys.has(from)) throw new Error('ERR no such key');
        if (keys.has(to)) return 0;
        keys.delete(from);
        keys.add(to);
        return 1;
      },
    };
  }

  const legacy = [
    `arrakis:guild-applications:${g}`,
    `arrakis:guild-chat:${g}:${app}:${gen}`,
    'arrakis:solido:42:2026-11-07',
    'arrakis:session:keepme',
  ];

  it('dry run changes nothing', async () => {
    const redis = fakeRedis(legacy);
    const report = await runRekey(redis, { apply: false });
    expect(report).toMatchObject({ scanned: 4, planned: 3, renamed: 0 });
    expect([...redis.keys].sort()).toEqual([...legacy].sort());
  });

  it('applies, is idempotent, and never overwrites an existing new key', async () => {
    const redis = fakeRedis([...legacy, guildKeys.applications(g)]);
    const first = await runRekey(redis, { apply: true });
    expect(first.renamed).toBe(2);
    expect(first.conflicts).toEqual([`arrakis:guild-applications:${g}`]);
    expect(redis.keys.has('arrakis:session:keepme')).toBe(true);
    expect(redis.keys.has(solidoKeys.history('42', '2026-11-07'))).toBe(true);

    const second = await runRekey(redis, { apply: true });
    expect(second.renamed).toBe(0);
    expect(second.conflicts).toEqual([`arrakis:guild-applications:${g}`]);
  });
});
