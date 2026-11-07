import type { VehicleView } from '../../../../features/vehicles/normalize';
import { SegmentedNav } from '../../_components/segmented-nav';

/**
 * Own / Shared switcher. The caller must only render this when both sides have vehicles:
 * with zero access the bar does not exist at all, not even disabled.
 */
export function AccessBar({ view, owned, shared }: { view: VehicleView; owned: number; shared: number }) {
  return (
    <SegmentedNav
      label="Vehicle access"
      active={view}
      items={[
        { id: 'owned', label: 'Owned', count: owned, href: '/vehicles' },
        { id: 'shared', label: 'Shared', count: shared, href: '/vehicles?view=shared' },
      ]}
    />
  );
}
