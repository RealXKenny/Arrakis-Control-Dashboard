import { clampPercent, formatStorage, formatVolume } from '../utils/formatting';
import {
  getBaseId,
  getBaseName,
  getBaseOwner,
  getBaseRelationship,
  getBaseType,
  getGeneratorSeconds,
  getMaxGeneratorUptimeSeconds,
  getStorageData,
  getWaterData,
  isOwnedBase,
} from '../utils/bases';
import { getPowerColor, getStorageColor, getWaterColor } from '../utils/progression';
import TelemetryMetric from './TelemetryMetric';

export default function BaseCard({ base, index, telemetry, selected = false, onSelect }) {
  const baseId = getBaseId(base);
  const baseName = getBaseName(base, index);
  const baseType = getBaseType(base);
  const owner = getBaseOwner(base);
  const relationship = getBaseRelationship(base);
  const inventory = telemetry?.inventory ?? base?.inventory ?? base?.inventoryData ?? base;
  const water = telemetry?.water ?? base?.water ?? base?.waterData ?? base;
  const runtimeSeconds = getGeneratorSeconds(base);
  // Dev note: generators measure uptime because “still humming” lacked precision.
  const powerPercent = clampPercent((runtimeSeconds / getMaxGeneratorUptimeSeconds(base)) * 100);
  const daysRemaining = runtimeSeconds / (24 * 60 * 60);
  const fullDays = Math.floor(daysRemaining);
  const remainingHours = Math.floor((daysRemaining - fullDays) * 24);
  const generatorAvailable = base?.generatorDataAvailable !== false;
  const waterData = getWaterData(water);
  const waterCurrent = waterData.current;
  const waterMax = waterData.max;
  const waterPercent = waterData.percent;
  const waterAvailable = waterData.available && waterMax !== null && waterMax > 0;
  const storageData = getStorageData(inventory);
  const storageUsed = storageData.used;
  const storageMax = storageData.max;
  const storagePercent = storageData.percent;
  const storageAvailable = storageData.available && storageMax !== null && storageMax > 0;
  const isOwned = isOwnedBase(base);
  const dotColor = isOwned ? 'var(--theme-accent)' : 'var(--theme-soft)';

  return (
    <article
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-expanded={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`min-h-65 min-w-0 rounded-3xl border bg-zinc-900/40 p-6 transition-colors hover:bg-zinc-900/60 ${
        isOwned ? 'border-indigo-500/20' : 'border-white/5'
      } ${onSelect ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-indigo-500/25 ring-offset-2 ring-offset-zinc-950' : ''}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="portal-glow-dot h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
              aria-hidden="true"
            />
            <strong className="truncate text-[1.05rem] font-semibold text-zinc-100" title={baseName}>
              {baseName}
            </strong>
          </div>
          <div className="mt-1 truncate pl-4.5 text-left text-xs text-zinc-500" title={baseType}>
            {baseType}
          </div>
          {isOwned && (
            <a
              className="base-export-button mt-2.5 inline-flex w-fit rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-300 no-underline transition-colors hover:bg-indigo-500/15"
              href={`/api/bases/${encodeURIComponent(baseId)}/export`}
              download
              onClick={(event) => event.stopPropagation()}
            >
              Download Blueprint ↓
            </a>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-white/5 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
          {relationship}
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-white/5 bg-zinc-950/30 px-3.5 py-3">
        <div className="mb-1 text-[11px] font-medium text-zinc-500">Owner</div>
        <div className="truncate text-sm text-zinc-300" title={owner}>
          {owner}
        </div>
      </div>

      <div className="base-metrics grid grid-cols-3 gap-4">
        <TelemetryMetric
          label="Runtime"
          percent={generatorAvailable ? powerPercent : null}
          color={getPowerColor(powerPercent)}
          value={generatorAvailable ? `${fullDays}d ${remainingHours}h remaining` : 'Unavailable'}
        />
        <TelemetryMetric
          label="Water"
          percent={waterPercent}
          color={getWaterColor(waterPercent)}
          value={
            waterAvailable
              ? `${formatVolume(waterCurrent)} / ${formatVolume(waterMax)}`
              : waterMax !== null
                ? `— / ${formatVolume(waterMax)}`
                : 'No data'
          }
        />
        <TelemetryMetric
          label="Storage"
          percent={storagePercent}
          color={getStorageColor(storagePercent)}
          value={storageAvailable ? `${formatStorage(storageUsed)} / ${formatStorage(storageMax)}` : 'No data'}
        />
      </div>

      {(telemetry?.waterError && !waterData.available) || (telemetry?.inventoryError && !storageData.available) ? (
        // Dev note: missing telemetry is displayed honestly; imagination is not an API.
        <div className="mt-4 border-t border-white/5 pt-3 text-xs leading-5 text-zinc-500">
          Telemetry unavailable for one or more systems.
        </div>
      ) : null}
    </article>
  );
}
