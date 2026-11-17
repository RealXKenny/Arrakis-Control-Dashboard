import data from '../data/arrakeen-markers.json';

// Sprite positions come from the user-supplied atlas metadata and category definitions.
export const markerSprites: Record<number, [number, number]> = {
  13076: [396, 1032],
  13082: [792, 1032],
  13079: [594, 1032],
  12710: [0, 944],
  12687: [594, 768],
  13078: [528, 1032],
  12683: [330, 768],
  13077: [462, 1032],
  13084: [924, 1032],
  12680: [132, 768],
  13083: [858, 1032],
  12682: [264, 768],
  13081: [726, 1032],
  12679: [66, 768],
  13085: [990, 1032],
  13080: [660, 1032],
  12695: [66, 856],
  12693: [990, 768],
};

export type ArrakeenCategory = 'Locations' | 'Services and trainers' | 'Contracts';
export const arrakeenCategories: ArrakeenCategory[] = ['Locations', 'Services and trainers', 'Contracts'];

/**
 * Map Genie coordinates, corrected with a least-squares affine fit against 18 in-game map icons and
 * checked against three agent-measured standing positions (within about 7 px, about 3 m). The residual
 * is about 9 px, so positions stay approximate and are not Console world coordinates.
 */
const correct = (x: number, y: number) => ({
  x: 1.04919 * x + 0.01201 * y - 31.34289,
  y: -0.00221 * x + 1.05528 * y - 9.7588,
});

/**
 * Positions read directly from the in-game Arrakeen map icons (screenshot registered to the image, then checked
 * against agent-measured standing positions). Markers without a matching in-game icon use the fitted position.
 */
const gameIconPositions: Record<number, [number, number]> = {
  460820: [1045, 282], // Exit
  460824: [858, 220], // The Salusan Bull
  460831: [744, 278], // Central Plaza
  460832: [538, 132], // Imperial Consulate
  460839: [547, 475], // The Warrens
  460840: [391, 479], // Duncan's Dojo
  460841: [271, 267], // Residency Approach
  949804: [874, 348], // Guild Bank
  949805: [853, 343], // CHOAM Exchange
  460826: [876, 167], // Barkeep
  460827: [711, 112], // Base Vendor
  479723: [621, 362], // Shaffat's Clinic
  460830: [813, 221], // House Mutelli Representative
  460843: [96, 371], // House Wallach Representative
  460822: [955, 251], // Scrap Trader
  460829: [759, 186], // Spice Merchant
  460821: [985, 298], // Taxi Service
  460823: [960, 309], // Vehicle Vendor
  460842: [10, 377], // Atreides Vendor
  460828: [711, 186], // Water Seller
  460835: [769, 384], // Weapons Merchant
};

export const arrakeenMarkers = data.map((marker) => {
  const category: ArrakeenCategory =
    marker.categoryId === 13076
      ? 'Locations'
      : marker.categoryId === 12693 || marker.categoryId === 12695
        ? 'Contracts'
        : 'Services and trainers';
  const fitted = correct(
    733.75 + (marker.longitude + 0.62312158772528) * 1812.5,
    273.75 - (marker.latitude - 0.71786135638061) * 1812.5,
  );
  const [x, y] = gameIconPositions[marker.id] ?? [fitted.x, fitted.y];
  return {
    id: marker.id,
    title: marker.title,
    category,
    left: (x / 1200) * 100,
    top: (y / 572) * 100,
    sprite: markerSprites[marker.categoryId],
  };
});
