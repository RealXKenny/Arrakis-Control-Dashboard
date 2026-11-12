#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

try {
  process.loadEnvFile('.env');
} catch {
  // The process environment remains sufficient when no local .env exists.
}

const { getServerEnv } = await import('../../src/config/env');
const { importSeasonDraft, prepareSeasonImport } = await import('../../src/features/seasons/server/import');

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function redisTarget() {
  const env = getServerEnv();
  if (env.REDIS_CLUSTER_NODES) return `cluster:${env.REDIS_CLUSTER_NODES}`;
  if (!env.REDIS_URL) throw new Error('REDIS_URL or REDIS_CLUSTER_NODES is required.');
  const url = new URL(env.REDIS_URL);
  return `${url.protocol}//${url.hostname}:${url.port || '6379'}${url.pathname || '/0'}`;
}

const contentPath = path.resolve(
  argument('--content') ?? fileURLToPath(new URL('../../src/features/seasons/content/season-1.json', import.meta.url)),
);
const apply = process.argv.includes('--apply');
const expectedTarget = argument('--target');
const target = redisTarget();
let client: { close(): void } | undefined;

try {
  const raw: unknown = JSON.parse(await readFile(contentPath, 'utf8'));
  const source = z
    .object({
      artwork: z
        .object({ file: z.string().trim().min(1).max(300), alt: z.string().trim().min(1).max(200) })
        .strict()
        .optional(),
    })
    .passthrough()
    .parse(raw);
  const artworkFile = source.artwork ? path.resolve(path.dirname(contentPath), source.artwork.file) : undefined;
  if (artworkFile && (await stat(artworkFile)).size > 3 * 1024 * 1024)
    throw new Error('Season artwork exceeds the 3 MiB input limit.');
  const prepared = await prepareSeasonImport({
    ...source,
    artwork: source.artwork && artworkFile ? { data: await readFile(artworkFile), alt: source.artwork.alt } : undefined,
  });
  console.log(`Target: ${target}`);
  console.log(`Content: ${prepared.definition.name} (Season ${prepared.definition.number}, ${prepared.id})`);
  console.log(
    `Validated: ${prepared.definition.rewards.length} rewards, ${prepared.definition.challenges.length} challenges, ${prepared.definition.milestones.length} milestones.`,
  );
  if (!apply) {
    console.log('DRY RUN: no Redis writes, publication, progression changes, or game grants.');
    console.log(`Apply explicitly with --apply --target "${target}"`);
  } else {
    if (expectedTarget !== target)
      throw new Error('Review the dry-run target, then repeat with its exact sanitized value in --target.');
    const { getRedisClient } = await import('../../src/lib/redis/client');
    client = getRedisClient();
    const result = await importSeasonDraft(prepared, 'season-content-importer');
    console.log(`${result.created ? 'IMPORTED' : 'UNCHANGED'}: ${result.season.id} is ${result.season.phase}.`);
    console.log('No publication, member progression, delivery activation, or game grant was performed.');
  }
} catch (error) {
  console.error(`Season import failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  client?.close();
}
