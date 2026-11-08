#!/usr/bin/env node
/**
 * One-time Redis re-key for Redis Cluster compatibility.
 *
 *   npm run redis:rekey            # dry run: counts what would move
 *   npm run redis:rekey -- --apply # perform the rename
 *
 * Run it against the existing single Redis node WITH THE DASHBOARD STOPPED, then deploy the release
 * that uses the new key names. Move the data to the cluster afterwards (RENAME cannot cross slots).
 */
import { Redis } from 'ioredis';
import { runRekey } from './rekey-rules.mjs';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the process environment.
}

const apply = process.argv.includes('--apply');
const url = process.env.REDIS_URL;
if (!url) {
  console.error('REDIS_URL is not set.');
  process.exit(1);
}
if (process.env.REDIS_CLUSTER_NODES) {
  console.error('REDIS_CLUSTER_NODES is set. Re-key the original single node, before moving data to a cluster.');
  process.exit(1);
}

const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, connectTimeout: 5000 });
redis.on('error', () => {});

try {
  await redis.connect();
  const report = await runRekey(redis, { apply });
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: scanned ${report.scanned} keys`);
  console.log(`  needing migration: ${report.planned}`);
  if (apply) {
    console.log(`  renamed:           ${report.renamed}`);
    console.log(`  vanished (expired or duplicate scan): ${report.vanished}`);
  }
  if (report.conflicts.length) {
    console.log(`  CONFLICTS (new key already exists, old key kept): ${report.conflicts.length}`);
    for (const key of report.conflicts.slice(0, 20)) console.log(`    ${key}`);
  }
  if (!apply && report.planned) console.log('Re-run with --apply to perform the rename.');
  process.exitCode = report.conflicts.length ? 2 : 0;
} catch (error) {
  console.error(`Re-key failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
