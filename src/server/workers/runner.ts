import '../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../lib/logger';
import { getRedisClient } from '../../lib/redis/client';
import { recordAudit } from '../../lib/security/audit';

/**
 * Background workers run inside the server process and are never reachable over HTTP. Each one declares its single
 * responsibility and hard execution bounds. A Redis lease keeps one instance working at a time across a fleet
 * (standalone or Cluster); a lost lease or crash simply lets the next tick take over, because every operation a worker
 * performs is itself idempotent or a compare-and-set.
 */
export type WorkerDefinition = {
  /** Stable name; used for the lease, health record and audit trail. */
  name: string;
  /** What this worker may touch, for reviewers. Workers must not exceed it. */
  scope: string;
  intervalMs: number;
  /** Hard wall-clock limit for one run. The run is abandoned (and counted as a failure) when it elapses. */
  timeoutMs: number;
  /** Consecutive failures tolerated before the worker backs off for `cooldownMs`. */
  retryBudget: number;
  cooldownMs: number;
  run(): Promise<Record<string, number | string>>;
};
export type WorkerHealth = {
  name: string;
  lastRunAt: string | null;
  lastOk: boolean | null;
  consecutiveFailures: number;
  pausedUntil: string | null;
  summary: Record<string, number | string>;
};
const ROOT = 'arrakis:{workers}';
const log = createLogger('WORKERS');
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

async function acquire(name: string, ttlMs: number) {
  const token = randomUUID();
  const result = await getRedisClient().command(['SET', `${ROOT}:lease:${name}`, token, 'PX', ttlMs, 'NX']);
  return result === 'OK' ? token : null;
}
async function release(name: string, token: string) {
  try {
    await getRedisClient().eval(RELEASE, [`${ROOT}:lease:${name}`], [token]);
  } catch {
    /* the lease expires on its own */
  }
}
export async function readWorkerHealth(name: string): Promise<WorkerHealth | null> {
  const raw = await getRedisClient().command(['GET', `${ROOT}:health:${name}`]);
  return typeof raw === 'string' ? (JSON.parse(raw) as WorkerHealth) : null;
}
async function writeHealth(health: WorkerHealth) {
  await getRedisClient().command(['SET', `${ROOT}:health:${health.name}`, JSON.stringify(health), 'EX', 7 * 86400]);
}
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} exceeded its ${ms} ms limit`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
/** One bounded, leased execution. Exported so tests can drive a worker deterministically. */
export async function runWorkerOnce(worker: WorkerDefinition, now = Date.now()): Promise<WorkerHealth | null> {
  const previous = (await readWorkerHealth(worker.name).catch(() => null)) ?? {
    name: worker.name,
    lastRunAt: null,
    lastOk: null,
    consecutiveFailures: 0,
    pausedUntil: null,
    summary: {},
  };
  if (previous.pausedUntil && Date.parse(previous.pausedUntil) > now) return previous;
  const token = await acquire(worker.name, worker.timeoutMs + 5000).catch(() => null);
  if (!token) return null;
  let health: WorkerHealth;
  try {
    const summary = await withTimeout(worker.run(), worker.timeoutMs, worker.name);
    health = {
      name: worker.name,
      lastRunAt: new Date(now).toISOString(),
      lastOk: true,
      consecutiveFailures: 0,
      pausedUntil: null,
      summary,
    };
  } catch (error) {
    const failures = previous.consecutiveFailures + 1;
    const exhausted = failures >= worker.retryBudget;
    health = {
      name: worker.name,
      lastRunAt: new Date(now).toISOString(),
      lastOk: false,
      consecutiveFailures: exhausted ? 0 : failures,
      pausedUntil: exhausted ? new Date(now + worker.cooldownMs).toISOString() : null,
      summary: { error: error instanceof Error ? error.message.slice(0, 160) : 'unknown' },
    };
    log.warn(`Worker ${worker.name} failed`, { failures, backoff: exhausted });
    void recordAudit({
      event: 'worker.failed',
      outcome: 'failure',
      data: { worker: worker.name, failures, backoff: exhausted },
    });
  } finally {
    await release(worker.name, token);
  }
  await writeHealth(health).catch(() => undefined);
  return health;
}
const globals = globalThis as typeof globalThis & { arrakisWorkersStarted?: boolean };
/** Starts every worker once per process. Timers never keep the process alive and never overlap themselves. */
export function startWorkers(workers: ReadonlyArray<WorkerDefinition>) {
  if (globals.arrakisWorkersStarted) return;
  globals.arrakisWorkersStarted = true;
  for (const worker of workers) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await runWorkerOnce(worker);
      } catch {
        /* a worker failure never reaches the server */
      } finally {
        running = false;
      }
    };
    setTimeout(() => void tick(), 2000 + Math.floor(Math.random() * 3000)).unref();
    setInterval(() => void tick(), worker.intervalMs).unref();
  }
}
