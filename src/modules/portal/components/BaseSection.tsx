import BaseImport from '../../bases/components/BaseImport';
import { useEffect, useState } from 'react';
import { getBaseId, getBaseName } from '../utils/bases';
import BaseCard from './BaseCard';
import BaseInventory from './BaseInventory';

function BaseGrid({ bases, telemetry, selectedBaseId, onSelectBase }) {
  if (bases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-8 text-center">
        <div className="text-sm text-zinc-200">No bases found</div>
        <div className="mt-1 text-xs text-zinc-500">There are currently no bases in this category.</div>
      </div>
    );
  }

  return (
    <div className="base-grid grid grid-cols-2 gap-4">
      {bases.map((base, index) => {
        const isOddFinalBase = bases.length % 2 === 1 && index === bases.length - 1;
        const baseId = getBaseId(base);
        return (
          <div
            key={baseId ?? `base-${index}`}
            className={`min-w-0 ${isOddFinalBase ? 'base-grid-last col-span-full' : ''}`}
          >
            <BaseCard
              base={base}
              index={index}
              telemetry={baseId ? telemetry[baseId] : null}
              selected={String(selectedBaseId) === String(baseId)}
              onSelect={() => onSelectBase(baseId)}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function BaseSection({
  visibleBases,
  basesTelemetry,
  basesLoading,
  bases,
  ownedBases,
  sharedBases,
  baseTab,
  setBaseTab,
  onOpenPreview,
}) {
  const [selectedBaseId, setSelectedBaseId] = useState(null);
  const selectedBase = visibleBases.find((base) => String(getBaseId(base)) === String(selectedBaseId));

  useEffect(() => {
    if (selectedBaseId && !selectedBase) setSelectedBaseId(null);
  }, [selectedBase, selectedBaseId]);

  return (
    <>
      <section className="mb-5 rounded-3xl border border-white/5 bg-zinc-900/40 p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Territory Network</p>
            <h2 className="m-0 text-xl font-semibold text-zinc-100">Bases</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>
              {ownedBases.length} owned · {sharedBases.length} shared
            </span>
            {baseTab === 'owned' && ownedBases.length > 0 && (
              <button
                type="button"
                onClick={onOpenPreview}
                className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 font-medium text-indigo-200 transition hover:bg-indigo-400/15"
              >
                Open full-screen preview <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/5 bg-zinc-950/50 p-1">
          <button
            type="button"
            onClick={() => setBaseTab('owned')}
            className={`rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${
              baseTab === 'owned' ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            Own Bases <span className="ml-1.5 text-zinc-500">{ownedBases.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setBaseTab('shared')}
            className={`rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${
              baseTab === 'shared' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            Shared Bases <span className="ml-1.5 text-zinc-500">{sharedBases.length}</span>
          </button>
        </div>

        {basesLoading && bases.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" aria-hidden="true" />
            Updating live telemetry...
          </div>
        )}

        <BaseGrid
          bases={visibleBases}
          telemetry={basesTelemetry}
          selectedBaseId={selectedBaseId}
          onSelectBase={(baseId) =>
            setSelectedBaseId((current) => (String(current) === String(baseId) ? null : baseId))
          }
        />
        {selectedBase && (
          <BaseInventory
            baseName={getBaseName(selectedBase, visibleBases.indexOf(selectedBase))}
            inventory={
              basesTelemetry[getBaseId(selectedBase)]?.inventory ?? selectedBase.inventory ?? selectedBase.inventoryData
            }
            onClose={() => setSelectedBaseId(null)}
          />
        )}
      </section>
      <BaseImport />
    </>
  );
}
