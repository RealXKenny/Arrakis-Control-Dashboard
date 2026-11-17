#!/usr/bin/env node
/**
 * Replace guessable marketplace owner keys with HMAC keys.
 *
 *   npm run marketplace:rekey                              # dry run: counts only, writes nothing
 *   npm run marketplace:rekey -- --apply --backup b.json   # migrate; b.json is written BEFORE any change
 *   npm run marketplace:rekey -- --rollback b.json         # undo a previous (even interrupted) apply
 *
 * Safe to run while the dashboard is online (it accepts both key generations) and safe to repeat or resume.
 * Uses REDIS_URL (or REDIS_CLUSTER_NODES for a Redis Cluster) and OWNER_KEY_SECRET (or AUTH_SECRET) from the environment. After rotating OWNER_KEY_SECRET, put the
 * old value in OWNER_KEY_PREVIOUS_SECRET and run it again to keep listings owned. The backup holds listing documents;
 * treat it as sensitive operational data.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { Cluster, Redis } from 'ioredis';
import { applyRekey, backupRekey, planRekey, rollbackRekey } from './rekey-marketplace-rules.mjs';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the process environment.
}

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const url = process.env.REDIS_URL;
const clusterNodes = process.env.REDIS_CLUSTER_NODES?.split(',')
  .map((node) => node.trim())
  .filter(Boolean)
  .map((node) => {
    const colon = node.lastIndexOf(':');
    return colon === -1
      ? { host: node, port: 6379 }
      : { host: node.slice(0, colon), port: Number(node.slice(colon + 1)) };
  });
if (!url && !clusterNodes?.length) {
  console.error('REDIS_URL (or REDIS_CLUSTER_NODES) is not set.');
  process.exit(1);
}

// The same credentials as the dashboard: REDIS_URL carries the password/TLS choice, REDIS_CLUSTER_NODES the topology.
const auth = url ? new URL(url) : undefined;
const redis = clusterNodes?.length
  ? new Cluster(clusterNodes, {
      lazyConnect: true,
      redisOptions: {
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        username: auth?.username ? decodeURIComponent(auth.username) : undefined,
        password: auth?.password ? decodeURIComponent(auth.password) : undefined,
        tls: auth?.protocol === 'rediss:' ? {} : undefined,
      },
    })
  : new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, connectTimeout: 5000 });
redis.on('error', () => {});
try {
  await redis.connect();
  if (option('--rollback')) {
    const backup = JSON.parse(await readFile(option('--rollback'), 'utf8'));
    const { restored } = await rollbackRekey(redis, backup);
    console.log(`ROLLED BACK: restored ${restored} of ${backup.length} listings`);
  } else {
    const plan = await planRekey(redis, process.env);
    const apply = args.includes('--apply');
    if (apply && !option('--backup'))
      throw new Error('--apply requires --backup <file> so the change can be rolled back.');
    console.log(`${apply ? 'PLAN' : 'DRY RUN'}: ${plan.listings} listings, ${plan.moves.length} to migrate`);
    console.log(`  listings whose owner has no known account (left unchanged): ${plan.unmatched.length}`);
    if (apply) {
      // The backup reaches the disk before the first write, so even a crash mid-run can be rolled back.
      const backup = await backupRekey(redis, plan);
      await writeFile(option('--backup'), JSON.stringify(backup), { mode: 0o600 });
      const result = await applyRekey(redis, plan);
      console.log(`APPLIED: moved ${result.moved}, skipped ${result.skipped}; backup written to ${option('--backup')}`);
    } else if (plan.moves.length) {
      console.log('Re-run with --apply --backup <file> to migrate.');
    }
  }
} catch (error) {
  console.error(`Marketplace re-key failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
