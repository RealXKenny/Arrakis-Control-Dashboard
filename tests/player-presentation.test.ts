import { expect, it } from 'vitest';
import { discordAvatar } from '../src/modules/player/server/avatar';
import { filterOwnedListings } from '../src/modules/portal/server/my-listings';

it('constructs Discord avatar URLs only from valid session fields', () => {
  expect(discordAvatar({ id: '12345', avatar: 'a'.repeat(32) })).toBe(
    `https://cdn.discordapp.com/avatars/12345/${'a'.repeat(32)}.png?size=128`,
  );
  expect(discordAvatar({ id: '../bad', avatar: 'a'.repeat(32) })).toBeNull();
  expect(discordAvatar({ id: '12345', avatar: null })).toBeNull();
});
it('filters by verified exact owner IDs, never display names or unsafe numeric IDs', () => {
  const mine = { owner_id: '9007199254740993', owner_name: 'Same name', owner_type: 'player' };
  expect(filterOwnedListings([mine, { ...mine, owner_id: 'other' }], new Set([mine.owner_id]))).toEqual([mine]);
  expect(() => filterOwnedListings([{ owner_name: 'Same name' }], new Set([mine.owner_id]))).toThrow(
    'verified seller IDs',
  );
  expect(() => filterOwnedListings([{ owner_id: 9007199254740993 }], new Set([mine.owner_id]))).toThrow(
    'verified seller IDs',
  );
});
