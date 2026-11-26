import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRedisClient } from '../../../lib/redis/client';
import type { WaterSample } from '../care';
import type { UpkeepOwner } from './store';

/**
 * N028 observed water samples. A sample is recorded only when the member views upkeep with a fresh profile,
 * so the history is sparse by design and its gaps are shown rather than interpolated.
 */
const WATER_SAMPLE_LIMITS = {
  intervalMs: 10 * 60_000,
  samples: 1008,
  retentionSeconds: 14 * 86400,
  windowMs: 7 * 86_400_000,
} as const;
const APPEND = `-- base-water-append-v1
local last = redis.call('LINDEX', KEYS[1], -1)
if last then
 local ok, value = pcall(cjson.decode, last)
 if ok and type(value) == 'table' and tonumber(value.t) and tonumber(ARGV[1]) - tonumber(value.t) < tonumber(ARGV[3]) then
  return 'skip'
 end
end
redis.call('RPUSH', KEYS[1], ARGV[2])
redis.call('LTRIM', KEYS[1], -tonumber(ARGV[4]), -1)
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 'ok'`;
const READ = `-- base-water-read-v1
return redis.call('LRANGE', KEYS[1], -tonumber(ARGV[1]), -1)`;
const sampleSchema = z.object({ t: z.number().int().positive(), p: z.number().min(0).max(100).nullable() }).strict();

export function waterSamplesKey(owner: UpkeepOwner, baseId: string): string {
  if (!/^[1-9][0-9]{0,15}$/.test(baseId)) throw new Error('Unsupported base');
  return `arrakis:base-water:v1:${createHash('sha256').update(`${owner.userId}\0${owner.controller}\0${owner.player}\0${baseId}`).digest('hex')}`;
}

/** Best effort: an unavailable sample store never hides current readings. Unknown readings are kept as gaps. */
export async function recordWaterSample(
  owner: UpkeepOwner,
  baseId: string,
  percent: number | null,
  at: number,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  const value = JSON.stringify({
    t: Math.floor(at),
    p: typeof percent === 'number' && Number.isFinite(percent) ? Math.round(percent * 10) / 10 : null,
  });
  try {
    const reply = await client.eval(
      APPEND,
      [waterSamplesKey(owner, baseId)],
      [
        Math.floor(at),
        value,
        WATER_SAMPLE_LIMITS.intervalMs,
        WATER_SAMPLE_LIMITS.samples,
        WATER_SAMPLE_LIMITS.retentionSeconds,
      ],
    );
    return reply === 'ok';
  } catch {
    return false;
  }
}

export async function readWaterSamples(owner: UpkeepOwner, baseId: string, now: number): Promise<WaterSample[] | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const rows = await client.eval(READ, [waterSamplesKey(owner, baseId)], [WATER_SAMPLE_LIMITS.samples]);
    if (!Array.isArray(rows)) return null;
    const samples: WaterSample[] = [];
    for (const row of rows) {
      if (typeof row !== 'string' || row.length > 200) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(row);
      } catch {
        continue;
      }
      const parsed = sampleSchema.safeParse(raw);
      if (!parsed.success || parsed.data.t < now - WATER_SAMPLE_LIMITS.windowMs || parsed.data.t > now + 60_000)
        continue;
      samples.push({ t: new Date(parsed.data.t).toISOString(), percent: parsed.data.p });
    }
    return samples;
  } catch {
    return null;
  }
}
