import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';

export const metadata: Metadata = { title: 'Hagga Basin map' };

export default function HaggaBasinPage() {
  return <MapPage mapName="HaggaBasin" />;
}
