import type { Metadata } from 'next';
import { groupVehicles } from '../../../features/vehicles/normalize';
import { loadVehicles } from '../../../features/vehicles/server/load';
import { requireSession } from '../../../features/auth/server/session';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { AccessBar } from '../../../features/vehicles/components/access-bar';
import { VehicleCard } from '../../../features/vehicles/components/vehicle-card';

export const metadata: Metadata = { title: 'Vehicles' };

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { view: requested } = await searchParams;
  const result = await loadVehicles(session);

  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Fleet" title="Vehicles" />
        {result.status === 'unlinked' && (
          <Notice title="Link your character">
            Link your Dune character through the Discord bot to see the vehicles you own or can access.
          </Notice>
        )}
        {result.status === 'limited' && (
          <Notice tone="warn" title="Slow down, traveller">
            Too many reads from your connection. Try again in {result.retryAfter} seconds.
          </Notice>
        )}
        {result.status === 'unavailable' && (
          <Notice tone="warn" title="Fleet unavailable">
            {result.message}
          </Notice>
        )}
      </>
    );
  }

  const groups = groupVehicles(result.vehicles, Array.isArray(requested) ? requested[0] : requested);
  const visible = groups.view === 'owned' ? groups.owned : groups.shared;

  return (
    <>
      <PageHeader eyebrow="Fleet" title="Vehicles">
        <p className="font-mono text-xs uppercase tracking-widest text-sand-400">{result.vehicles.length} accessible</p>
      </PageHeader>

      {visible.length === 0 ? (
        <Notice title="No vehicles">You do not own or have access to any vehicles yet.</Notice>
      ) : (
        <>
          {groups.showAccessBar && (
            <AccessBar view={groups.view} owned={groups.owned.length} shared={groups.shared.length} />
          )}
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((vehicle) => (
              <li key={vehicle.id} className="min-w-0">
                <VehicleCard vehicle={vehicle} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
