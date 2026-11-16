import { MAP_LABELS, MAP_NAMES, MAP_PATHS, type MapName } from '../maps';
import { SegmentedNav } from '../../../components/ui/segmented-nav';

/** Hagga Basin / Deep Desert switch; each world is its own page. */
export function MapSwitch({ active }: { active: MapName }) {
  return (
    <SegmentedNav
      label="Map"
      active={active}
      items={MAP_NAMES.map((name) => ({
        id: name,
        label: MAP_LABELS[name],
        href: MAP_PATHS[name],
      }))}
    />
  );
}
