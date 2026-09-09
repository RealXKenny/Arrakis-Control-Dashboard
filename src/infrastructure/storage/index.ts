import '../../lib/assert-server';
import { getServerEnv } from '../../config/env';
import { postgresStateStore } from './postgres';
import { redisStateStore } from './redis-store';
import type { StateStore } from './types';

export function getStateStore(): StateStore | null {
  const env = getServerEnv();
  if (env.STORAGE_BACKEND === 'postgres') return env.DATABASE_URL ? postgresStateStore : null;
  return env.REDIS_URL ? redisStateStore : null;
}
