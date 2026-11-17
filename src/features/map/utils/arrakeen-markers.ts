import data from '../data/arrakeen-markers.json';

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
  return { id: marker.id, title: marker.title, category, left: (x / 1200) * 100, top: (y / 572) * 100 };
});
