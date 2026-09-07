import { randomUUID, createHash } from 'node:crypto';
import './assert-server';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getServerEnv } from '../config/env';

let pending = Promise.resolve();

export function redactApiSnapshot(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return { name: value.name, message: '[ERROR DETAIL OMITTED]' };
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
  }
  if (depth > 64) return '[TRUNCATED]';
  if (value && typeof value === 'object') {
    const result = Array.isArray(value)
      ? value.map((entry) => redactApiSnapshot(entry, depth + 1, seen))
      : Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key,
            /^key$|password|secret|token|cookie|authorization|csrf|session|api.?key|owner.*(?:id|name)|account|email|discord|username|^error$|^message$|^reason$/i.test(
              key,
            )
              ? '[REDACTED]'
              : redactApiSnapshot(entry, depth + 1, seen),
          ]),
        );
    seen.delete(value);
    return result;
  }
  if (typeof value === 'string') {
    // Provider error text can echo secrets outside fields named token/password.
    const env = getServerEnv();
    let safe = value.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]');
    for (const [key, secret] of Object.entries(env)) {
      if (/password|secret|token|api.?key/i.test(key) && typeof secret === 'string' && secret.length >= 4)
        safe = safe.split(secret).join('[REDACTED]');
    }
    return safe;
  }
  return value;
}

/** Latest response per source, method and endpoint. Never record request credentials. */
export async function captureApiSnapshot(
  route: string,
  status: number,
  data: unknown,
  source = 'console',
  method = 'GET',
): Promise<void> {
  try {
    const path = new URL(route, 'http://local').pathname;
    if (getServerEnv().API_DEBUG_ENABLED !== 'true') return;
    const snapshot = JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        path,
        status,
        source,
        method,
        response: /auth|login|oauth|session/i.test(path) ? '[AUTH RESPONSE OMITTED]' : redactApiSnapshot(data),
      },
      null,
      2,
    );

    pending = pending
      .then(async () => {
        const directory = join(process.cwd(), 'debug', 'api');
        await mkdir(directory, { recursive: true });
        const file = join(
          directory,
          `${source.replace(/[^a-z0-9_-]/gi, '')}-${method.replace(/[^a-z]/gi, '')}-${path.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100)}-${createHash('sha256').update(path).digest('hex').slice(0, 12)}.json`,
        );
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, snapshot, { mode: 0o600 });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      })
      .catch(() => {
        /* Diagnostics must never break a request. */
      });
    await pending;
  } catch {
    /* Diagnostics must never change API behavior. */
  }
}
