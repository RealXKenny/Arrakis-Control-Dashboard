import { record, rows, label } from './inventory';
import { getNumber } from './formatting';
import type { PopulationHistory } from './population';

export type WorldReading = {
  observedAt: string;
  map: string;
  spice: { count: number; sectors: string[] } | null;
  nextCycleAt: string | null;
  population?: PopulationHistory | null;
  totalPlayHours?: number | null;
  market: { listings: number | null; items: number | null; playerListings: number | null } | null;
  council: {
    term: string;
    endsAt: string | null;
    decided: number;
    total: number;
    atreides: number;
    harkonnen: number;
  } | null;
};

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/** Allowlist public aggregates; never forward map actors or administrative player records. */
export function worldReading(map: string, markers: unknown, market: unknown, landsraad: unknown): WorldReading {
  const source = record(markers);
  const entries = rows(markers);
  const spice = entries?.filter((entry) => entry.type === 'spice_active');
  const exchange = record(market);
  const council = record(landsraad);
  const term = record(council.term);
  const tasks = rows(council.tasks)?.filter((task) => task.sysselraad !== true);
  return {
    observedAt: new Date().toISOString(),
    map,
    spice:
      record(source.capabilities).spice_active === true && spice
        ? {
            count: spice.length,
            sectors: [
              ...new Set(spice.map((entry) => label(entry.sector, '')).filter((sector) => /^[A-I][1-9]$/.test(sector))),
            ].sort(),
          }
        : null,
    nextCycleAt: date(source.coriolisNextCycleAt),
    market:
      market != null && record(exchange.capabilities).exchange !== false
        ? {
            listings: getNumber(exchange.totalListings),
            items: getNumber(exchange.uniqueItems),
            playerListings: getNumber(exchange.playerListings),
          }
        : null,
    council:
      record(council.capabilities).landsraad !== false && term.term_id != null && tasks
        ? {
            term: label(term.term_id),
            endsAt: date(term.end_time),
            decided: tasks.filter((task) => task.completed === true).length,
            total: tasks.length,
            atreides: tasks.filter(
              (task) => task.completed === true && String(task.winning_faction).toLowerCase() === 'atreides',
            ).length,
            harkonnen: tasks.filter(
              (task) => task.completed === true && String(task.winning_faction).toLowerCase() === 'harkonnen',
            ).length,
          }
        : null,
  };
}

export function timeRemaining(value: string | null, now: number): string {
  if (!value) return 'Not reported';
  const remaining = Date.parse(value) - now;
  if (!Number.isFinite(remaining)) return 'Not reported';
  if (remaining <= 0) return 'Awaiting update';
  const minutes = Math.floor(remaining / 60000);
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}m`;
}
