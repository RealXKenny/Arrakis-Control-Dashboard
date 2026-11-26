import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  baseDirectoryInputSchema,
  filterGuildBases,
  guildBaseDraftSchema,
  type GuildBaseEntry,
} from '../../../src/features/guilds/base-directory';

const draft = () => ({
  id: randomUUID(),
  name: 'South base',
  map: 'hagga-basin',
  purpose: 'storage',
  location: 'South of the rock arch',
  contact: 'Quartermaster',
  accessInstructions: 'Ask before entering.',
  notes: '',
});
const entry = (patch = {}): GuildBaseEntry => ({
  ...draft(),
  map: 'hagga-basin',
  purpose: 'storage',
  revision: randomUUID(),
  status: 'active',
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  updatedByName: 'Leader',
  ...patch,
});
describe('guild base directory contracts', () => {
  it('requires useful bounded listing fields and known maps/purposes', () => {
    expect(guildBaseDraftSchema.safeParse(draft()).success).toBe(true);
    for (const patch of [
      { name: '' },
      { location: '' },
      { contact: '' },
      { accessInstructions: '' },
      { map: 'unknown' },
      { purpose: 'unknown' },
      { accessInstructions: 'x'.repeat(1001) },
    ])
      expect(guildBaseDraftSchema.safeParse({ ...draft(), ...patch }).success).toBe(false);
  });
  it('never accepts caller-supplied permissions, author identity or in-game ownership claims', () => {
    const input = { action: 'save', revision: null, entry: draft() };
    expect(baseDirectoryInputSchema.safeParse(input).success).toBe(true);
    expect(baseDirectoryInputSchema.safeParse({ ...input, canEdit: true }).success).toBe(false);
    for (const extra of [
      { updatedByName: 'Fake leader' },
      { ownerId: 'other-player' },
      { grantAccess: true },
      { consoleBaseId: '123' },
    ])
      expect(baseDirectoryInputSchema.safeParse({ ...input, entry: { ...draft(), ...extra } }).success).toBe(false);
  });
  it('filters active/archive status, map, purpose and private local search text', () => {
    const entries = [
      entry(),
      entry({ name: 'Desert relay', map: 'deep-desert', purpose: 'staging', contact: 'Pilot' }),
      entry({ name: 'Old vault', status: 'archived' }),
    ];
    expect(filterGuildBases(entries, 'quartermaster', '', '', 'active').map((value) => value.name)).toEqual([
      'South base',
    ]);
    expect(filterGuildBases(entries, '', 'deep-desert', 'staging', 'active').map((value) => value.name)).toEqual([
      'Desert relay',
    ]);
    expect(filterGuildBases(entries, 'old', '', '', 'archived').map((value) => value.name)).toEqual(['Old vault']);
    expect(filterGuildBases(entries, '', 'hagga-basin', 'crafting', 'active')).toEqual([]);
  });
});
