import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';
export const metadata: Metadata = { title: 'Overland map' };
export default function OverlandPage() {
  return <MapPage mapName="Overland" />;
}
