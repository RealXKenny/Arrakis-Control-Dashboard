import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));

describe('guild roster matching', async () => {
  const { rosterRowIsPlayer } = await import('../../../src/features/player/server/handler');
  const own = new Set(['101', '202']);

  it('matches by any known ID field', () => {
    expect(rosterRowIsPlayer({ player_id: '101' }, own, 'Paul')).toBe(true);
    expect(rosterRowIsPlayer({ controllerId: 202 }, own, 'Paul')).toBe(true);
  });

  it('does not treat a same-named member with a different ID as the player', () => {
    expect(rosterRowIsPlayer({ player_id: '999', character_name: 'Paul' }, own, 'paul')).toBe(false);
  });

  it('falls back to the name only for rows that carry no ID', () => {
    expect(rosterRowIsPlayer({ name: ' PAUL ' }, own, 'paul')).toBe(true);
    expect(rosterRowIsPlayer({ name: 'Chani' }, own, 'paul')).toBe(false);
    expect(rosterRowIsPlayer({}, own, '')).toBe(false);
  });
});
