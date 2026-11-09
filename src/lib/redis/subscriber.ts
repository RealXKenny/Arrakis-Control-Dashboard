import '../assert-server';
import { Cluster, Redis, type ClusterOptions, type RedisOptions } from 'ioredis';
import { getServerEnv } from '../../config/env';
import { clusterNodesFromEnv, parseRedisUrl } from './connection';

type Connection = Redis | Cluster;

function retry(attempt: number): number {
  return Math.min(attempt * 200, 5_000) + Math.floor(Math.random() * 250);
}

export async function createRedisPatternSubscriber(
  pattern: string,
  onMessage: (channel: string, message: string) => void,
  onError: () => void = () => undefined,
): Promise<{ close: () => void }> {
  const env = getServerEnv();
  let connection: Connection;
  if (env.REDIS_CLUSTER_NODES) {
    const base = env.REDIS_URL ? parseRedisUrl(env.REDIS_URL) : {};
    const redisOptions: RedisOptions = {
      connectTimeout: base.connectTimeout,
      keepAlive: base.keepAlive,
      noDelay: base.noDelay,
      maxRetriesPerRequest: 1,
      tls: base.tls,
      username: base.username,
      password: base.password,
      retryStrategy: retry,
    };
    const options: ClusterOptions = {
      lazyConnect: true,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      redisOptions,
      clusterRetryStrategy: retry,
      retryDelayOnFailover: 300,
      retryDelayOnClusterDown: 500,
    };
    connection = new Cluster(clusterNodesFromEnv(env.REDIS_CLUSTER_NODES), options);
  } else {
    if (!env.REDIS_URL) throw new Error('Chat live distribution requires REDIS_URL.');
    connection = new Redis({
      ...parseRedisUrl(env.REDIS_URL),
      retryStrategy: retry,
      maxRetriesPerRequest: 1,
    });
  }
  connection.on('error', onError);
  connection.on('pmessage', (_pattern: string, channel: string, message: string) => onMessage(channel, message));
  try {
    await connection.connect();
    await connection.psubscribe(pattern);
  } catch (error) {
    connection.disconnect();
    throw error;
  }
  return { close: () => connection.disconnect() };
}
