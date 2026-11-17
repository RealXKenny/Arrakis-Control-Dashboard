import { expect, it } from 'vitest';
import {
  buildObservationTimeline,
  healthObservationSchema,
  projectServerStatus,
  type HealthObservation,
} from '../../../src/features/monitoring/incidents';

const at = (seconds: number) => Date.parse('2026-11-16T00:00:00Z') + seconds * 1000;
const observation = (seconds: number, state: HealthObservation['state']): HealthObservation => ({
  at: at(seconds),
  state,
  services: [{ name: 'Survival_1', status: state === 'healthy' ? 'READY' : 'STOPPED' }],
});

it('projects only bounded health fields and uses the provider sample time', () => {
  const result = projectServerStatus(
    {
      schemaVersion: 1,
      sampledAt: '2026-11-16T00:00:00Z',
      data: {
        summary: { overall: 'DEGRADED', serverIp: 'private', title: 'private' },
        gameServers: [{ map: 'Survival_1', status: 'READY', uptime: 'private' }],
      },
      stdout: 'private',
    },
    at(60),
  );
  expect(result).toEqual({
    at: at(0),
    state: 'degraded',
    services: [{ name: 'Survival_1', status: 'READY' }],
  });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(projectServerStatus({ schemaVersion: 2 }, at(60))).toBeNull();
});

it('distinguishes state changes, confirmed recovery, missing coverage and exact duplicates', () => {
  const values = [
    observation(0, 'outage'),
    observation(0, 'outage'),
    observation(60, 'outage'),
    observation(120, 'degraded'),
    observation(180, 'healthy'),
    observation(600, 'unavailable'),
    observation(660, 'unavailable'),
  ];
  const episodes = buildObservationTimeline(values, at(660));
  expect(episodes).toHaveLength(3);
  expect(episodes[2]).toMatchObject({
    state: 'outage',
    startedAt: new Date(at(0)).toISOString(),
    endedAt: new Date(at(120)).toISOString(),
    recoveredAt: null,
    ongoing: false,
    affectedServices: ['Survival_1'],
  });
  expect(episodes[1]).toMatchObject({
    state: 'degraded',
    startedAt: new Date(at(120)).toISOString(),
    endedAt: new Date(at(180)).toISOString(),
    recoveredAt: new Date(at(180)).toISOString(),
  });
  expect(episodes[0]).toMatchObject({
    state: 'unavailable',
    startedAt: new Date(at(600)).toISOString(),
    endedAt: null,
    recoveredAt: null,
    ongoing: true,
  });
  const recovered = buildObservationTimeline(values.slice(0, 5), at(180));
  expect(recovered[0]).toMatchObject({ recoveredAt: new Date(at(180)).toISOString(), ongoing: false });
  const stale = buildObservationTimeline([observation(0, 'outage')], at(600));
  expect(stale[0]).toMatchObject({ endedAt: new Date(at(0)).toISOString(), recoveredAt: null, ongoing: false });
  expect(healthObservationSchema.safeParse(observation(0, 'outage')).success).toBe(true);
});
