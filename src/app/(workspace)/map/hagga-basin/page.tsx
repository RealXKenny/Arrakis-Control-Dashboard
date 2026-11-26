import type { Metadata } from 'next';
import { MapPage } from '../../../../features/map/components/map-page';
import { parseMapPin } from '../../../../features/map/utils/pin';

export const metadata: Metadata = { title: 'Hagga Basin map' };

export default async function HaggaBasinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <MapPage mapName="HaggaBasin" pin={parseMapPin(await searchParams)} />;
}
