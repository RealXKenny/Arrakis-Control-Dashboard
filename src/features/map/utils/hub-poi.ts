/** Browser-safe naming and icon choices for Console points of interest on the image-based hub maps. */
export type HubPoiCategory = 'Locations' | 'Services and trainers';

const titles: Record<string, string> = {
  CHOAMExchange: 'CHOAM Exchange',
  Bank: 'Guild Bank',
  ImperialConsulate: 'Imperial Consulate',
  VehicleVendor: 'Vehicle Vendor',
  TaxiService: 'Taxi Service',
  BarkeepVendor: 'Barkeep',
  WeaponsVendor: 'Weapons Merchant',
  HarkonnenVendor: 'Harkonnen Vendor',
  LandsraadVendor: 'Landsraad Vendor',
  ResourceVendor: 'Scrap Trader',
  StructureVendor: 'Base Vendor',
  SpiceVendor: 'Spice Merchant',
  SurvivalVendor: 'Water Seller',
};
const locations = new Set(['CHOAMExchange', 'Bank', 'ImperialConsulate']);
/** Atlas category ids (see arrakeen-markers.ts) per subtype. */
const atlasCategory: Record<string, number> = {
  BarkeepVendor: 13082,
  WeaponsVendor: 13080,
  VehicleVendor: 13081,
  TaxiService: 13083,
  SpiceVendor: 13084,
  SurvivalVendor: 13085,
  ResourceVendor: 13077,
  StructureVendor: 13079,
  LandsraadVendor: 13078,
  HarkonnenVendor: 13078,
};

const words = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();

export function hubPoiTitle(subtype: string) {
  if (titles[subtype]) return titles[subtype];
  const rep = /^HouseRepresentative(.+)$/.exec(subtype);
  return rep ? `House ${words(rep[1])} Representative` : words(subtype);
}
export const hubPoiCategory = (subtype: string): HubPoiCategory =>
  locations.has(subtype) ? 'Locations' : 'Services and trainers';
export const hubPoiAtlasCategory = (subtype: string) =>
  atlasCategory[subtype] ?? (subtype.startsWith('HouseRepresentative') ? 12687 : 13076);
