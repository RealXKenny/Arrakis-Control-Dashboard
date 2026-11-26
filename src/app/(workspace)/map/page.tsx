import { redirect } from 'next/navigation';
import { MAP_PATHS, resolveMapName } from '../../../features/map/maps';

/** The old single-page URL keeps working: `?map=DeepDesert` lands on the Deep Desert page, everything else on Hagga Basin. */
export default async function MapIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(MAP_PATHS[resolveMapName((await searchParams).map)]);
}
