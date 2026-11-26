import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';
import { parseMapPin } from '../../../../features/map/utils/pin';

export const metadata: Metadata = { title: 'Deep Desert map' };

export default async function DeepDesertPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <MapPage mapName="DeepDesert" pin={parseMapPin(await searchParams)} />;
}
