import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';

/** Keep unsafe-size integers as decimal strings using the original JSON source on Node 22+. */
export function parseAdminJson(text: string): unknown {
  return JSON.parse(text, (_key, value, context?: { source?: string }) => {
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
    ) {
      if (!context?.source) throw new Error('Provider returned an unsafe number without source precision.');
      return context.source;
    }
    return value;
  });
}

export function sanitizeAdminData(value: unknown) {
  const env = getServerEnv();
  const secrets = Object.entries(env)
    .filter(([key, entry]) => /token|key|secret|redis_url/i.test(key) && typeof entry === 'string' && entry.length >= 4)
    .map(([, entry]) => String(entry));
  if (env.REDIS_URL) {
    const password = decodeURIComponent(new URL(env.REDIS_URL).password);
    if (password.length >= 4) secrets.push(password);
  }
  let budget = 512 * 1024;
  let truncated = false;
  const hidden =
    /password|passphrase|secret|authorization|cookie|csrf|access[_-]?token|refresh[_-]?token|api[_-]?key|funcom[_-]?token|^token$|^hash$|^env$|stdout|stderr|stack/i;
  function text(input: string) {
    let safe = input.replace(/\u001b\[[0-9;]*m/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    for (const secret of secrets) safe = safe.split(secret).join('[REDACTED]');
    safe = safe
      .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
      .replace(/((?:password|passphrase|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;"'}]+/gi, '$1[REDACTED]');
    const available = Math.max(0, Math.min(32_768, budget));
    if (safe.length > available) {
      truncated = true;
      safe = safe.slice(0, available) + '…';
    }
    budget -= safe.length;
    return safe;
  }
  function visit(entry: unknown, depth = 0): unknown {
    if (budget <= 0 || depth > 10) {
      truncated = true;
      return '[truncated]';
    }
    if (typeof entry === 'string') return text(entry);
    if (typeof entry === 'number')
      return Number.isSafeInteger(entry) || !Number.isInteger(entry) ? entry : String(entry);
    if (entry === null || typeof entry === 'boolean') return entry;
    if (Array.isArray(entry)) {
      if (entry.length > 1000) truncated = true;
      return entry.slice(0, 1000).map((item) => visit(item, depth + 1));
    }
    if (entry && typeof entry === 'object') {
      const fields = Object.entries(entry);
      if (fields.length > 200) truncated = true;
      return Object.fromEntries(
        fields
          .slice(0, 200)
          .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
          .map(([key, item]) => [text(key), hidden.test(key) ? '[REDACTED]' : visit(item, depth + 1)]),
      );
    }
    return null;
  }
  return { data: visit(value), truncated };
}
