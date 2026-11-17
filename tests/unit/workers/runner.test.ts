import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, value, ...rest]: (string | number)[]) => {
      if (op === 'GET') return store.get(String(key)) ?? null;
      if (op === 'SET') {
        if (rest.includes('NX') && store.has(String(key))) return null;
        store.set(String(key), String(value));
        return 'OK';
      }
      return null;
    },
    eval: async (_script: string, keys: string[], args: (string | number)[]) => {
      if (store.get(keys[0]) === String(args[0])) {
        store.delete(keys[0]);
        return 1;
      }
      return 0;
    },
  }),
}));
vi.mock('../../../src/lib/security/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
import { readWorkerHealth, runWorkerOnce, type WorkerDefinition } from '../../../src/server/workers/runner';

const worker = (run: WorkerDefinition['run'], overrides: Partial<WorkerDefinition> = {}): WorkerDefinition => ({
  name: 'test-worker',
  scope: 'test',
  intervalMs: 1000,
  timeoutMs: 200,
  retryBudget: 2,
  cooldownMs: 60_000,
  run,
  ...overrides,
});
beforeEach(() => store.clear());

describe('worker execution boundaries', () => {
  it('lets only one concurrent runner execute, and releases the lease afterwards', async () => {
    const run = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { done: 1 };
    });
    const results = await Promise.all([
      runWorkerOnce(worker(run)),
      runWorkerOnce(worker(run)),
      runWorkerOnce(worker(run)),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect([...store.keys()].some((key) => key.includes(':lease:'))).toBe(false);
    expect((await readWorkerHealth('test-worker'))?.lastOk).toBe(true);
  });
  it('records a crash as a failure without throwing, and recovers on the next run', async () => {
    const failing = await runWorkerOnce(
      worker(async () => {
        throw new Error('Redis unavailable');
      }),
    );
    expect(failing).toMatchObject({ lastOk: false, consecutiveFailures: 1 });
    const recovered = await runWorkerOnce(worker(async () => ({ ok: 1 })));
    expect(recovered).toMatchObject({ lastOk: true, consecutiveFailures: 0 });
  });
  it('abandons a run that exceeds its timeout', async () => {
    const result = await runWorkerOnce(worker(() => new Promise(() => undefined), { timeoutMs: 20 }));
    expect(result?.lastOk).toBe(false);
    expect(String(result?.summary.error)).toContain('exceeded');
  });
  it('backs off after the retry budget is spent and runs nothing during the cool-down', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    await runWorkerOnce(worker(run));
    const exhausted = await runWorkerOnce(worker(run));
    expect(exhausted?.pausedUntil).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(2);
    await runWorkerOnce(worker(run));
    expect(run).toHaveBeenCalledTimes(2);
    // After the cool-down it runs again.
    await runWorkerOnce(worker(run), Date.now() + 120_000);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
describe('authorization boundary', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }
  it('is never imported by a route, so no worker control is reachable over HTTP', () => {
    for (const root of ['src/app', 'src/pages']) {
      for (const file of files(root).filter((f) => /\.(ts|tsx)$/.test(f))) {
        const text = readFileSync(file, 'utf8');
        expect(text, file).not.toMatch(/server\/workers|runWorkerOnce|startBackgroundWorkers/);
      }
    }
  });
  it('leaves no administrator route, page or identity behind', () => {
    const everything = [...files('src')].filter((f) => /\.(ts|tsx)$/.test(f));
    expect(everything.filter((f) => /[\\/]admin[\\/]/.test(f))).toEqual([]);
    for (const file of everything) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/ADMIN_DISCORD_IDS|requireApiAdmin|isDashboardAdmin|requireDashboardAdmin/);
    }
  });
});
