import { describe, expect, it } from 'vitest';
import { buildPortalProfile } from '../../../src/features/portal/view-model';

const player = {
  linked: true,
  characterName: 'Paul',
  pawnId: 7,
  onlineStatus: 'Online',
  avatarUrl: null,
  details: {
    progression: { level: 12, xp: 3400, unspentSkillPoints: 2 },
    currency: { rows: [{ label: 'Solari', balance: 1250 }] },
    guild: { name: 'House Atreides', faction: 'Atreides', rank: 100 },
    vehicles: [
      { id: 'v1', name: 'Bike', type: 'Sandbike', owner_name: 'Paul', fuel_percent: 40 },
      { id: 'v2', name: 'Stranger', type: 'Buggy', owner_name: 'Feyd' },
    ],
    bases: {
      rows: [
        {
          id: 'b1',
          name: 'Fort',
          base_type: 'Fortress',
          owner_name: 'Paul',
          relationship: 'owner',
          generatorRuntimeSeconds: 3600 * 100,
          water: { volume: 50, maxVolume: 200 },
          inventory: { totals: { currentVolume: 95, maxVolume: 100 } },
        },
        { id: 'b2', name: 'Outpost', relationship: 'shared', owner_name: 'Stilgar', waterDataAvailable: false },
      ],
    },
  },
};

describe('V2 portal view model', () => {
  const profile = buildPortalProfile(player);

  it('builds a typed character', () => {
    expect(profile.character).toMatchObject({
      name: 'Paul',
      status: 'Online',
      level: 12,
      solarisCredit: 1250,
      unspentSkillPoints: 2,
      guild: { name: 'House Atreides', faction: 'Atreides', rank: 'Leader' },
    });
  });

  it('classifies bases and derives gauges', () => {
    const [fort, outpost] = profile.bases;
    expect(fort).toMatchObject({ id: 'b1', owned: true });
    expect(fort.water.percent).toBe(25);
    expect(fort.storage.percent).toBe(95);
    expect(fort.runtime.text).toMatch(/^\d+d \d+h remaining$/);
    expect(outpost.owned).toBe(false);
    expect(outpost.water.text).toBe('No data');
    expect(outpost.telemetryGap).toBe(true);
  });

  it('counts only vehicles the player can access', () => {
    expect(profile.vehicles.map((vehicle) => vehicle.id)).toEqual(['v1']);
  });
});
