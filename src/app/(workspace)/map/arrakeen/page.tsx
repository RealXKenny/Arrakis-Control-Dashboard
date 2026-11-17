import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';
export const metadata: Metadata = { title: 'Arrakeen map' };
export default function ArrakeenPage() {
  return <MapPage mapName="Arrakeen" />;
}
