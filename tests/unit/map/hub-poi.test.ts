import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
import { parseHubPoi } from '../../../src/features/map/server/hub-poi';
import { hubPoiAtlasCategory, hubPoiCategory, hubPoiTitle } from '../../../src/features/map/utils/hub-poi';

describe('hub points of interest', () => {
  it('keeps only bounded static points and drops private or malformed rows', () => {
    const rows = [
      { type: 'poi', subtype: 'Bank', name: 'Bank', x: 1751, y: 1740, z: 5 },
      { type: 'poi', subtype: 'Bank', name: 'Bank', x: 1751.2, y: 1740.1 },
      { type: 'house_representative', subtype: 'HouseRepresentativeAlexin', x: 9977, y: 11503 },
      { type: 'player', name: 'Someone', online_status: 'Online', x: 1, y: 1 },
      { type: 'base', name: 'Secret base', x: 1, y: 1 },
      { type: 'poi', subtype: '../etc', x: 1, y: 1 },
      { type: 'poi', subtype: 'Bank', x: Number.NaN, y: 1 },
    ];
    const points = parseHubPoi({ rows });
    expect(points.map((p) => p.subtype)).toEqual(['Bank', 'HouseRepresentativeAlexin']);
    expect(Object.keys(points[0]).sort()).toEqual(['id', 'subtype', 'x', 'y']);
    expect(parseHubPoi(null)).toEqual([]);
    expect(parseHubPoi({ rows: new Array(5001).fill({}) })).toEqual([]);
  });

  it('names and categorises Console subtypes like the in-game legend', () => {
    expect(hubPoiTitle('CHOAMExchange')).toBe('CHOAM Exchange');
    expect(hubPoiTitle('BarkeepVendor')).toBe('Barkeep');
    expect(hubPoiTitle('HouseRepresentativeSpinette')).toBe('House Spinette Representative');
    expect(hubPoiTitle('SomethingNew')).toBe('Something New');
    expect(hubPoiCategory('Bank')).toBe('Locations');
    expect(hubPoiCategory('TaxiService')).toBe('Services and trainers');
    expect(hubPoiAtlasCategory('TaxiService')).toBe(13083);
    expect(hubPoiAtlasCategory('HouseRepresentativeAlexin')).toBe(12687);
  });
});
