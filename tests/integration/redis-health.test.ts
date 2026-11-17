import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/monitoring/server/health');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/monitoring/server/health');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

it('deduplicates exact health observations and applies durable bounded retention', async () => {
  const now = Date.now();
  const outage = { at: now - 60000, state: 'outage' as const, services: [] };
  await store.recordHealthObservation(outage, now);
  await store.recordHealthObservation(outage, now);
  await store.recordHealthObservation({ at: now, state: 'healthy', services: [] }, now);
  expect(await store.readHealthObservations(now)).toHaveLength(2);
  const [key] = await direct.keys('arrakis:monitoring:health:*');
  expect(await direct.ttl(key)).toBeGreaterThan(7 * 86400);
  await store.recordHealthObservation({ at: now - 8 * 86400000, state: 'outage', services: [] }, now);
  expect(await store.readHealthObservations(now)).toHaveLength(2);
});
