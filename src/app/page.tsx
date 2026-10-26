import {
  getDashboardSnapshot,
  MAP_IDS,
  parseMapParam,
  ProviderBusyError,
  ProviderRateLimitedError,
  ProviderReadError,
} from '../lib/data-provider';
import type { DashboardSnapshot } from '../lib/types';
import InteractiveControls from '../components/InteractiveControls';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ map?: string | string[] }> }) {
  const { map: mapParam } = await searchParams;
  const map = parseMapParam(mapParam);

  let snapshot: DashboardSnapshot | null = null;
  let rejection: string | null = null;
  try {
    snapshot = await getDashboardSnapshot(map, 'page-render:/');
  } catch (error) {
    if (
      error instanceof ProviderBusyError ||
      error instanceof ProviderRateLimitedError ||
      error instanceof ProviderReadError
    ) {
      rejection = error.message;
    } else {
      throw error;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Operations dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live world telemetry for the Crimson Skies community, refreshed every 30 seconds.
          </p>
        </div>
        <span className="rounded-full border border-edge bg-panel px-3 py-1 text-xs text-zinc-400">Map · {map}</span>
      </div>

      {snapshot ? (
        <InteractiveControls snapshot={snapshot} maps={MAP_IDS} />
      ) : (
        <div className="rounded-2xl border border-edge bg-panel p-8 text-center">
          <p className="text-sm font-medium text-zinc-200">{rejection ?? 'Unable to load the dashboard right now.'}</p>
          <p className="mt-1 text-xs text-zinc-500">
            The capacity guard or an upstream service rejected this render; nothing on your side needs to change.
          </p>
          <a
            href={`/?map=${map}`}
            className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            Retry now
          </a>
        </div>
      )}
    </div>
  );
}
