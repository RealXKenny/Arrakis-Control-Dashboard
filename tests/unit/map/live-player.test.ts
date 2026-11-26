import { describe, expect, it } from 'vitest';
import { matchLivePlayer } from '../../../src/features/map/server/live-player';

const now = 1_800_000_000_000;
const own = {
  id: 6,
  type: 'player',
  map: 'Arrakeen',
  online_status: 'Online',
  partition_id: 3,
  x: 100,
  y: 200,
  z: 300,
};
const roster = { capabilities: { players: true }, rows: [own] };
const snapshot = {
  t: now - 200,
  sources: [{ map: 'SH_Arrakeen', partition: 3, ready: true }],
  objects: [{ i: 22, k: 'player', s: 0, x: 110, y: 220, z: 310 }],
};
const match = (r: unknown, s: unknown) => matchLivePlayer(r, s, 'Arrakeen', '6', now);

describe('live player matching', () => {
  it('returns only the inferred position for a unique online player and ready source', () => {
    expect(match(roster, snapshot)).toEqual({ x: 110, y: 220, z: 310, partition: 3 });
  });
  it('falls back for ambiguous console players or agent objects', () => {
    expect(match({ ...roster, rows: [own, { ...own, id: 7 }] }, snapshot)).toBeNull();
    expect(match({ ...roster, rows: [own, { ...own, id: 7, partition_id: null }] }, snapshot)).toBeNull();
    expect(
      match(roster, { ...snapshot, objects: [...snapshot.objects, { ...snapshot.objects[0], i: 23 }] }),
    ).toBeNull();
  });
  it.each([
    ['HaggaBasin', 'Survival_1'],
    ['DeepDesert', 'DeepDesert_1'],
    ['HarkoVillage', 'SH_HarkoVillage'],
  ] as const)('requires the correct agent source for %s', (map, source) => {
    const mapRoster = { ...roster, rows: [{ ...own, map }] };
    const mapSnapshot = { ...snapshot, sources: [{ map: source, partition: 3, ready: true }] };
    expect(matchLivePlayer(mapRoster, mapSnapshot, map, '6', now)).not.toBeNull();
    expect(matchLivePlayer(mapRoster, snapshot, map, '6', now)).toBeNull();
  });
  it('falls back for stale, unready, different partition, distant or missing player data', () => {
    expect(match(roster, { ...snapshot, t: now - 5001 })).toBeNull();
    expect(match(roster, { ...snapshot, sources: [{ map: 'SH_Arrakeen', partition: 3, ready: false }] })).toBeNull();
    expect(match(roster, { ...snapshot, sources: [{ map: 'SH_Arrakeen', partition: 4, ready: true }] })).toBeNull();
    expect(match(roster, { ...snapshot, objects: [{ ...snapshot.objects[0], x: 30101 }] })).toBeNull();
    expect(match(roster, { ...snapshot, objects: [] })).toBeNull();
    expect(match({ ...roster, capabilities: {} }, snapshot)).toBeNull();
    expect(match({ ...roster, rows: [{ ...own, online_status: 'Offline' }] }, snapshot)).toBeNull();
  });
});
