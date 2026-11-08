import '../assert-server';
import { randomUUID } from 'node:crypto';
import { getServerEnv } from '../../config/env';
import { auditKeys } from '../redis/keys';
import { getRedisClient } from '../redis/client';

/**
 * Durable security audit trail.
 *
 * Each event is written twice, both optional and configurable:
 *  - as one JSON line on stdout (prefixed `AUDIT `) for log shipping and retention outside the app;
 *  - into a bounded Redis sorted set (trimmed by age and by count on every write) for in-app investigation.
 *
 * Events carry identifiers and outcomes only. Anything that looks like a credential is dropped by key name, values
 * are length-bounded, and nested data is flattened away, so passwords, tokens, cookies and request bodies cannot
 * end up in the trail. Recording never throws: auditing must not break the action it describes.
 */
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditEvent = {
  /** Dotted event name, e.g. `admin.operation`, `auth.login_failed`. */
  event: string;
  outcome: AuditOutcome;
  /** Discord user ID of the acting member, when known. */
  actor?: string;
  /** Client network (IPv4 address or IPv6 /64) when known. */
  ip?: string;
  /** Flat, non-secret details: IDs, operation names, counts. */
  data?: Record<string, unknown>;
};
export type StoredAuditEvent = {
  id: string;
  at: string;
  event: string;
  outcome: AuditOutcome;
  actor?: string;
  ip?: string;
  data?: Record<string, string | number | boolean>;
};

const SECRET_KEY =
  /(password|passphrase|token|secret|cookie|authorization|session|api[-_]?key|credential|bearer|email|body)/i;
const MAX_FIELDS = 20;
const MAX_STRING = 200;

export function sanitizeAuditData(data: Record<string, unknown> | undefined): StoredAuditEvent['data'] {
  if (!data) return undefined;
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data).slice(0, MAX_FIELDS)) {
    if (SECRET_KEY.test(key) || !/^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(key)) continue;
    if (typeof value === 'string') safe[key] = value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_STRING);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
  }
  return Object.keys(safe).length ? safe : undefined;
}

const TRIM_SCRIPT = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -(tonumber(ARGV[4]) + 1))
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1
`;

const recent = new Map<string, number>();
/** Orders events recorded within the same millisecond: a sorted set breaks score ties by member text, which is random. */
let sequence = 0;

/** Record a security event. Fire-and-forget safe: returns a promise that never rejects. */
export async function recordAudit(input: AuditEvent): Promise<void> {
  try {
    const env = getServerEnv();
    const now = Date.now();
    const event: StoredAuditEvent = {
      id: randomUUID(),
      at: new Date(now).toISOString(),
      event: input.event.slice(0, 64),
      outcome: input.outcome,
      ...(input.actor && /^\d{1,25}$/.test(input.actor) ? { actor: input.actor } : {}),
      ...(input.ip ? { ip: input.ip.slice(0, 64) } : {}),
      ...(sanitizeAuditData(input.data) ? { data: sanitizeAuditData(input.data) } : {}),
    };
    const line = JSON.stringify(event);
    if (env.AUDIT_LOG_STDOUT === true) process.stdout.write(`AUDIT ${line}\n`);
    if (env.AUDIT_LOG_REDIS !== true) return;
    const redis = getRedisClient();
    if (!redis) return;
    const retentionSeconds = (env.AUDIT_LOG_RETENTION_DAYS ?? 90) * 24 * 60 * 60;
    await redis.eval(
      TRIM_SCRIPT,
      [auditKeys.events],
      [
        now + (sequence++ % 1000) / 1000,
        line,
        now - retentionSeconds * 1000,
        env.AUDIT_LOG_MAX_ENTRIES ?? 10_000,
        retentionSeconds,
      ],
    );
  } catch {
    // Throttle the complaint: a Redis outage would otherwise add a warning to every audited request.
    const last = recent.get('failure') ?? 0;
    if (Date.now() - last > 60_000) {
      recent.set('failure', Date.now());
      // Loaded lazily so importing the audit module never requires a full logging configuration.
      const { createLogger } = await import('../logger');
      createLogger('AUDIT').warn('Audit event could not be stored in Redis; stdout copy (if enabled) is unaffected');
    }
  }
}

/** Newest-first read for the administrator API. */
export async function readAudit(limit = 100): Promise<StoredAuditEvent[]> {
  const redis = getRedisClient();
  if (!redis) return [];
  const count = Math.max(1, Math.min(500, Math.floor(limit)));
  const values = await redis.eval(
    `return redis.call('ZREVRANGE', KEYS[1], 0, ARGV[1] - 1)`,
    [auditKeys.events],
    [count],
  );
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    try {
      const parsed = JSON.parse(String(value)) as StoredAuditEvent;
      return typeof parsed.event === 'string' ? [parsed] : [];
    } catch {
      return [];
    }
  });
}
