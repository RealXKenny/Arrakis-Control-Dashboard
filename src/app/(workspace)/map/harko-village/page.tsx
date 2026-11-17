import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';
export const metadata: Metadata = { title: 'Harko Village map' };
export default function HarkoVillagePage() {
  return <MapPage mapName="HarkoVillage" />;
}
