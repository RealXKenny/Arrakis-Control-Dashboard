export type PopulationPoint = { at: number; online: number };
export type PopulationHistory = {
  from: number;
  to: number;
  points: PopulationPoint[];
  peak: number | null;
  playHours: number | null;
  coverageHours: number;
};

export const DAY_MS = 86400000;
export const MAX_SAMPLE_GAP_MS = 90000;

/** Integrate only adjacent observations. Missing time is not zero population. */
export function summarizePopulation(values: unknown[], now: number): PopulationHistory {
  const unique = new Map<number, PopulationPoint>();
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const point = value as PopulationPoint;
    if (
      Number.isFinite(point.at) &&
      point.at >= now - DAY_MS &&
      point.at <= now &&
      Number.isSafeInteger(point.online) &&
      point.online >= 0
    )
      unique.set(point.at, { at: point.at, online: point.online });
  }
  const points = [...unique.values()].sort((a, b) => a.at - b.at);
  let coverage = 0;
  let playerMilliseconds = 0;
  for (let i = 1; i < points.length; i++) {
    const elapsed = points[i].at - points[i - 1].at;
    if (elapsed > MAX_SAMPLE_GAP_MS) continue;
    coverage += elapsed;
    playerMilliseconds += (elapsed * (points[i].online + points[i - 1].online)) / 2;
  }
  return {
    from: now - DAY_MS,
    to: now,
    points,
    peak: points.length ? Math.max(...points.map((point) => point.online)) : null,
    playHours: coverage ? playerMilliseconds / 3600000 : null,
    coverageHours: coverage / 3600000,
  };
}

export function populationSegments(history: PopulationHistory): PopulationPoint[][] {
  const segments: PopulationPoint[][] = [];
  for (const point of history.points) {
    const current = segments[segments.length - 1];
    if (!current || point.at - current[current.length - 1].at > MAX_SAMPLE_GAP_MS) segments.push([point]);
    else current.push(point);
  }
  return segments;
}
