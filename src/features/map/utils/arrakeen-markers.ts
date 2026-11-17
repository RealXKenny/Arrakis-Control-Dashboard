import data from '../data/arrakeen-markers.json';

// Sprite positions come from the user-supplied atlas metadata and category definitions.
const sprites: Record<number, [number, number]> = {
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

/** Approximate alignment against the user-provided Map Genie screenshot, not Console world coordinates. */
export const arrakeenMarkers = data.map((marker) => {
  const category: ArrakeenCategory =
    marker.categoryId === 13076
      ? 'Locations'
      : marker.categoryId === 12693 || marker.categoryId === 12695
        ? 'Contracts'
        : 'Services and trainers';
  const x = 733.75 + (marker.longitude + 0.62312158772528) * 1812.5;
  const y = 273.75 - (marker.latitude - 0.71786135638061) * 1812.5;
  return {
    id: marker.id,
    title: marker.title,
    category,
    left: (x / 1200) * 100,
    top: (y / 572) * 100,
    sprite: sprites[marker.categoryId],
  };
});
