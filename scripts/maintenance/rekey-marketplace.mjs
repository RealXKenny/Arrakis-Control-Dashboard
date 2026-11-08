#!/usr/bin/env node
/**
 * Replace guessable marketplace owner keys with HMAC keys.
 *
 *   npm run marketplace:rekey                              # dry run: counts only, writes nothing
 *   npm run marketplace:rekey -- --apply --backup b.json   # migrate; b.json is required and allows rollback
 *   npm run marketplace:rekey -- --rollback b.json         # undo a previous apply
 *
 * Safe to run while the dashboard is online (it accepts both key generations) and safe to repeat. Uses REDIS_URL
 * and OWNER_KEY_SECRET (or AUTH_SECRET) from the environment. Treat the backup file as sensitive operational data.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { applyRekey, planRekey, rollbackRekey } from './rekey-marketplace-rules.mjs';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the process environment.
}

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const url = process.env.REDIS_URL;
if (!url) {
  console.error('REDIS_URL is not set.');
  process.exit(1);
}

const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, connectTimeout: 5000 });
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
    console.log(`${apply ? 'PLAN' : 'DRY RUN'}: ${plan.listings} listings, ${plan.moves.length} to migrate`);
    console.log(`  listings whose owner has no known account (left unchanged): ${plan.unmatched.length}`);
    if (apply) {
      const file = option('--backup');
      if (!file) throw new Error('--apply requires --backup <file> so the change can be rolled back.');
      const result = await applyRekey(redis, plan);
      await writeFile(file, JSON.stringify(result.backup), { mode: 0o600 });
      console.log(`APPLIED: moved ${result.moved}, skipped ${result.skipped}; backup written to ${file}`);
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
