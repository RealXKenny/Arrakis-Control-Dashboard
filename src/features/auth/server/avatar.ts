import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { discordAvatarKeys } from '../../../lib/redis/keys';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { discordAvatarUrl } from '../identity';

const MAX_BYTES = 128 * 1024;
const MAX_IMAGES = 512;
const IDLE_TTL_SECONDS = 30 * 86_400;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEYS = [discordAvatarKeys.images, discordAvatarKeys.access];
const READ = `
local value = redis.call('HGET', KEYS[1], ARGV[1])
if value then
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
end
return value
`;
const WRITE = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
local excess = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[4])
if excess > 0 then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, excess - 1)
  for _, member in ipairs(oldest) do
    redis.call('HDEL', KEYS[1], member)
    redis.call('ZREM', KEYS[2], member)
  end
end
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('EXPIRE', KEYS[2], ARGV[5])
return 1
`;

const globals = globalThis as typeof globalThis & { arrakisAvatarDownloads?: Map<string, Promise<Buffer>> };
const downloads = (globals.arrakisAvatarDownloads ??= new Map());

function unavailable(status = 502): AppError {
  return new AppError('Profile image is temporarily unavailable.', status, 'AVATAR_UNAVAILABLE', true);
}

/** Only fixed-size PNG responses from our fixed Discord URL may enter this image cache. */
function validImage(bytes: Buffer): boolean {
  return (
    bytes.length >= 33 &&
    bytes.length <= MAX_BYTES &&
    bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(16) <= 128 &&
    bytes.readUInt32BE(20) > 0 &&
    bytes.readUInt32BE(20) <= 128
  );
}

async function download(userId: string, avatar: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`, {
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'image/png' },
    });
    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0].trim() !== 'image/png' ||
      Number(response.headers.get('content-length')) > MAX_BYTES ||
      !response.body
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw unavailable(response.status === 404 ? 404 : 502);
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw unavailable();
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, total);
    if (!validImage(bytes)) throw unavailable();
    return bytes;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

export async function serveDiscordAvatar(
  _request: Request,
  userId: string,
  avatar: string,
  viewerId: string,
): Promise<Response> {
  if (!discordAvatarUrl(userId, avatar)) throw new AppError('Invalid profile image.', 400, 'INVALID_AVATAR', true);
  const redis = getRedisClient();
  if (!redis) throw unavailable(503);
  const member = `${userId}:${avatar}`;
  let bytes: Buffer | null = null;
  try {
    const cached = await redis.eval(READ, KEYS, [member, Date.now(), IDLE_TTL_SECONDS]);
    if (
      typeof cached === 'string' &&
      cached.length <= Math.ceil(MAX_BYTES / 3) * 4 &&
      /^[A-Za-z0-9+/]+=*$/.test(cached)
    ) {
      const decoded = Buffer.from(cached, 'base64');
      if (validImage(decoded)) bytes = decoded;
    }
  } catch {
    throw unavailable(503);
  }
  if (!bytes) {
    let pending = downloads.get(member);
    if (!pending) {
      if (downloads.size >= 8) throw unavailable(429);
      const limits = await Promise.all([
        checkRateLimit(`avatar:user:${viewerId}`, { limit: 30, windowMs: 60_000 }),
        checkRateLimit('avatar:downloads', { limit: 120, windowMs: 60_000 }),
      ]);
      if (limits.some((limit) => limit.storageUnavailable)) throw unavailable(503);
      if (limits.some((limit) => !limit.allowed)) throw unavailable(429);
      // Check again after the rate-limit await so simultaneous requests cannot duplicate downloads.
      pending = downloads.get(member);
      if (!pending) {
        if (downloads.size >= 8) throw unavailable(429);
        pending = (async () => {
          const image = await download(userId, avatar);
          try {
            await redis.eval(WRITE, KEYS, [member, image.toString('base64'), Date.now(), MAX_IMAGES, IDLE_TTL_SECONDS]);
          } catch {
            throw unavailable(503);
          }
          return image;
        })();
        downloads.set(member, pending);
      }
    }
    try {
      bytes = await pending;
    } finally {
      if (downloads.get(member) === pending) downloads.delete(member);
    }
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
