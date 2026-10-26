/**
 * Shared parameter interfaces for the App Router dashboard layer.
 *
 * Type-only module: safe to import from both Server and Client Components.
 * Shapes intentionally mirror the Pages Router payloads
 * (src/modules/portal/utils/world.ts and utils/population.ts) so the two
 * routers can be cut over one module at a time without payload drift.
 */

export type MapId = 'DeepDesert' | 'HaggaBasin';

export type SpiceSectorStatus = 'harvesting' | 'contested' | 'dormant';

export type SpiceSector = {
  /** Grid cell identifier, e.g. "C4"; matches the ^[A-I][1-9]$ contract. */
  id: string;
  status: SpiceSectorStatus;
  solariPerHour: number;
  harvesters: number;
  controller: 'Atreides' | 'Harkonnen' | 'Unclaimed';
};

export type MarketCounts = {
  /** Total exchange listings. */
  listings: number | null;
  /** Unique items listed. */
  items: number | null;
  /** Player-owned listings. */
  playerListings: number | null;
};

export type PopulationPoint = { at: number; online: number };

export type PopulationHistory = {
  from: number;
  to: number;
  points: PopulationPoint[];
  peak: number | null;
  playHours: number | null;
  coverageHours: number;
};

export type LandsraadTerm = {
  term: string;
  endsAt: string | null;
  decided: number;
  total: number;
  atreides: number;
  harkonnen: number;
};

export type SystemLogLevel = 'info' | 'warn' | 'error';

export type SystemLogEntry = {
  id: string;
  /** ISO-8601 timestamp. */
  at: string;
  level: SystemLogLevel;
  /** Subsystem that emitted the entry, e.g. "market-sync". */
  source: string;
  message: string;
};

export type DashboardSnapshot = {
  /** ISO-8601 timestamp for when the snapshot was assembled. */
  observedAt: string;
  map: MapId;
  spiceSectors: SpiceSector[];
  marketCounts: MarketCounts;
  populationHistory: PopulationHistory;
  landsraad: LandsraadTerm | null;
  nextCycleAt: string | null;
  totalPlayHours: number | null;
  systemLogs: SystemLogEntry[];
};

/** Admission knobs mirroring src/infrastructure/pages-api.ts. */
export type LoadProfile = {
  globalReadsPerMinute: number;
  readsPerIpPerMinute: number;
  maxConcurrentRequests: number;
};
