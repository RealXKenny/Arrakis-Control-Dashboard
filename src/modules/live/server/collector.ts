import { randomUUID } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { openRabbitObserver } from '../../../infrastructure/rabbitmq';
import { logger } from '../../../lib/logger';
import { normalizeEvent } from './normalize';
import { liveStore, saveEvent } from './store';

const state = globalThis as typeof globalThis & { liveCollectorStarted?: boolean };
export function startLiveCollector() {
  if (state.liveCollectorStarted || getServerEnv().LIVE_EVENTS_ENABLED !== 'true') return;
  state.liveCollectorStarted = true;
  const owner = randomUUID();
  let observer: Awaited<ReturnType<typeof openRabbitObserver>> | null = null;
  let started = 0;
  let leaseDeadline = 0;
  setInterval(() => {
    if (observer && Date.now() >= leaseDeadline) {
      void observer.close();
      observer = null;
    }
  }, 1000).unref();
  async function tick() {
    try {
      const { redis, prefix } = liveStore();
      const lease = `${prefix}:lease`;
      const held = await redis.eval(
        `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], 60) end; return 0`,
        [lease],
        [owner],
      );
      if (!held && !(await redis.set(lease, owner, { nx: true, ex: 60 }))) {
        await observer?.close();
        observer = null;
      } else {
        leaseDeadline = Date.now() + 40000;
        if (observer?.isClosed() || Date.now() - started > 300000) {
          await observer?.close();
          observer = null;
        }
        if (!observer) {
          observer = await openRabbitObserver(async (source, payload) => {
            await saveEvent(normalizeEvent(source, payload.toString('utf8'), randomUUID(), Date.now()));
          });
          started = Date.now();
        }
        await redis.set(`${prefix}:connected`, Date.now(), { ex: 45 });
      }
    } catch {
      await observer?.close();
      observer = null;
      logger.warn('Live collector unavailable; retrying. Check broker, TLS and Redis configuration.');
    } finally {
      setTimeout(tick, 15000).unref();
    }
  }
  void tick();
}
