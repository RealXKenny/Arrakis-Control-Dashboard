import { MAP_LABELS, MAP_NAMES, type MapName } from '../../../../features/map/maps';
import { SegmentedNav } from '../../_components/segmented-nav';

/** Hagga Basin / Deep Desert switch; the chosen map lives in the URL. */
export function MapSwitch({ active }: { active: MapName }) {
  return (
    <SegmentedNav
      label="Map"
      active={active}
      items={MAP_NAMES.map((name) => ({
        id: name,
        label: MAP_LABELS[name],
        href: name === 'HaggaBasin' ? '/map' : `/map?map=${name}`,
      }))}
    />
  );
}
