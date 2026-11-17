import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';

export const metadata: Metadata = { title: 'Deep Desert map' };

export default function DeepDesertPage() {
  return <MapPage mapName="DeepDesert" />;
}
