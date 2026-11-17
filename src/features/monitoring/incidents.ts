import { z } from 'zod';

const healthState = z.enum(['healthy', 'degraded', 'outage', 'unavailable']);
const service = z.object({ name: z.string().trim().min(1).max(100), status: z.string().trim().min(1).max(40) });
export const healthObservationSchema = z.object({
  at: z.number().int().min(0).max(8_640_000_000_000_000),
  state: healthState,
  services: z.array(service).max(50),
});
export type HealthObservation = z.infer<typeof healthObservationSchema>;
export type HealthState = HealthObservation['state'];

const serverStatus = z.object({
  schemaVersion: z.literal(1),
  sampledAt: z.string().datetime({ offset: true }).optional(),
  data: z.object({
    summary: z.object({ overall: z.string().trim().min(1).max(40) }),
    gameServers: z.array(z.object({ map: z.string().trim().min(1).max(100), status: service.shape.status })).max(50),
  }),
});

function classifyStatus(value: string): HealthState {
  const status = value.toUpperCase().replaceAll('-', '_');
  if (status === 'READY' || status === 'HEALTHY' || status === 'RUNNING') return 'healthy';
  if (['DEGRADED', 'PARTIAL', 'STARTING', 'STOPPING', 'WARNING'].includes(status)) return 'degraded';
  if (['STOPPED', 'DOWN', 'FAILED', 'FAILURE', 'UNREADY', 'NOT_READY', 'ERROR'].includes(status)) return 'outage';
  return 'unavailable';
}

export function projectServerStatus(value: unknown, observedAt: number): HealthObservation | null {
  const result = serverStatus.safeParse(value);
  if (!result.success) return null;
  const sampledAt = result.data.sampledAt ? Date.parse(result.data.sampledAt) : Number.NaN;
  const at = Number.isFinite(sampledAt) && sampledAt <= observedAt + 300_000 ? sampledAt : observedAt;
  return {
    at,
    state: classifyStatus(result.data.data.summary.overall),
    services: result.data.data.gameServers.map((item) => ({ name: item.map, status: item.status })),
  };
}

export type ObservationEpisode = {
  kind: 'observation';
  id: string;
  state: Exclude<HealthState, 'healthy'>;
  startedAt: string;
  endedAt: string | null;
  recoveredAt: string | null;
  durationSeconds: number;
  ongoing: boolean;
  affectedServices: string[];
};
export type RestartTimelineEntry = {
  kind: 'restart';
  id: string;
  result: 'Succeeded' | 'Failed';
  target: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
};
export type IncidentTimelineEntry = ObservationEpisode | RestartTimelineEntry;
export type IncidentTimelineData = {
  entries: IncidentTimelineEntry[];
  healthAvailable: boolean;
  restartsAvailable: boolean;
  checkedAt: string;
};

const MAX_GAP_MS = 180_000;

/** Derive observations, not confirmed incident causes. Missing readings end coverage without proving recovery. */
export function buildObservationTimeline(values: HealthObservation[], now: number): ObservationEpisode[] {
  const unique = new Map<string, HealthObservation>();
  for (const value of values) unique.set(`${value.at}:${value.state}`, value);
  const observations = [...unique.values()].sort((a, b) => a.at - b.at || a.state.localeCompare(b.state));
  const episodes: ObservationEpisode[] = [];
  let current: {
    state: ObservationEpisode['state'];
    start: number;
    last: number;
    services: Set<string>;
  } | null = null;
  let previousAt: number | null = null;
  const finish = (end: number, recoveredAt: number | null, ongoing = false) => {
    if (!current) return;
    episodes.push({
      kind: 'observation',
      id: `observation:${current.start}:${current.state}`,
      state: current.state,
      startedAt: new Date(current.start).toISOString(),
      endedAt: ongoing ? null : new Date(end).toISOString(),
      recoveredAt: recoveredAt === null ? null : new Date(recoveredAt).toISOString(),
      durationSeconds: Math.max(0, Math.round((end - current.start) / 1000)),
      ongoing,
      affectedServices: [...current.services].sort(),
    });
    current = null;
  };
  for (const observation of observations) {
    if (previousAt !== null && observation.at - previousAt > MAX_GAP_MS) finish(current?.last ?? previousAt, null);
    if (observation.state === 'healthy') {
      if (current) finish(observation.at, observation.at);
    } else {
      if (current?.state !== observation.state) {
        if (current) finish(observation.at, null);
        current = { state: observation.state, start: observation.at, last: observation.at, services: new Set() };
      }
      if (current) {
        current.last = observation.at;
        for (const item of observation.services)
          if (classifyStatus(item.status) !== 'healthy') current.services.add(item.name);
      }
    }
    previousAt = observation.at;
  }
  if (current) {
    const ongoing = now - current.last <= MAX_GAP_MS && current.last <= now + 300_000;
    finish(ongoing ? now : current.last, null, ongoing);
  }
  return episodes.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 100);
}
