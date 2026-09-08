/** Browser-only transport cache; private snapshots require a server-validated session scope. */
const PREFIX = 'arrakis:read:v1:';
export const CLIENT_STALE_MS = 30_000;
type Identity = { cacheScope: string; expiresAt: number; checkedAt: number };
type Snapshot = { body: string; capturedAt: number };
let generation = 0;
let identity: Identity | null = null;
let checking: Promise<Identity | Response> | null = null;
const memory = new Map<string, Snapshot>();

export function clearClientReadCache(notify = false) {
  generation++;
  identity = null;
  memory.clear();
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* Storage is optional. */
  }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('api-cache-invalidated'));
}
async function verifiedIdentity(): Promise<Identity | Response> {
  if (identity && identity.expiresAt > Date.now() && Date.now() - identity.checkedAt < CLIENT_STALE_MS) return identity;
  if (checking) return checking;
  const validationEpoch = generation;
  checking = (async () => {
    const response = await fetch('/api/session', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      clearClientReadCache();
      return response;
    }
    const data: unknown = await response.json();
    if (validationEpoch !== generation) throw new DOMException('Cache invalidated', 'AbortError');
    if (
      !data ||
      typeof data !== 'object' ||
      !('cacheScope' in data) ||
      typeof data.cacheScope !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.cacheScope) ||
      !('expiresAt' in data) ||
      typeof data.expiresAt !== 'number' ||
      data.expiresAt <= Date.now()
    )
      throw new Error('Session validation failed');
    try {
      if (sessionStorage.getItem(`${PREFIX}scope`) !== data.cacheScope) clearClientReadCache();
      sessionStorage.setItem(`${PREFIX}scope`, data.cacheScope);
    } catch {
      /* Storage is optional. */
    }
    identity = { cacheScope: data.cacheScope, expiresAt: data.expiresAt, checkedAt: Date.now() };
    return identity;
  })().finally(() => {
    checking = null;
  });
  return checking;
}
function read(key: string): Snapshot | null {
  try {
    const value = memory.get(key) ?? JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value.body === 'string' &&
      Number.isFinite(value.capturedAt) &&
      Date.now() >= value.capturedAt &&
      Date.now() - value.capturedAt <= 300_000
    )
      return value;
    memory.delete(key);
    sessionStorage.removeItem(key);
  } catch {
    /* Missing or malformed browser storage is a cache miss. */
  }
  return null;
}
function save(key: string, value: Snapshot) {
  if (value.body.length > 2 * 1024 * 1024) return;
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > 20) memory.delete(memory.keys().next().value!);
  try {
    const keys = Object.keys(sessionStorage).filter((entry) => entry.startsWith(PREFIX) && entry !== `${PREFIX}scope`);
    if (keys.length >= 20 && !keys.includes(key)) sessionStorage.removeItem(keys[0]);
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota failure leaves the in-memory cache available. */
  }
}
const cachedResponse = (value: Snapshot) =>
  new Response(value.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Data-Captured-At': String(value.capturedAt),
      'X-Client-Cache': 'hit',
    },
  });
export async function cachedFetch(
  url: string,
  options: { signal?: AbortSignal; force?: boolean; onCached?: (response: Response) => Promise<void> } = {},
): Promise<Response> {
  options.signal?.throwIfAborted();
  const publicRead = url.split('?')[0] === '/api/server/status';
  const session = publicRead ? null : await verifiedIdentity();
  options.signal?.throwIfAborted();
  if (session instanceof Response) return session.clone();
  const epoch = generation;
  const key = `${PREFIX}${session?.cacheScope ?? 'public'}:${url}`;
  const snapshot = read(key);
  if (snapshot && !options.force && Date.now() - snapshot.capturedAt < CLIENT_STALE_MS) return cachedResponse(snapshot);
  if (snapshot && options.onCached) await options.onCached(cachedResponse(snapshot));
  const response = await fetch(url, {
    cache: 'no-store',
    signal: options.signal,
    headers: options.force ? { 'X-Refresh-Cache': '1' } : {},
  });
  if (!publicRead && epoch !== generation) throw new DOMException('Cache invalidated', 'AbortError');
  if (response.status === 401 || response.status === 403) clearClientReadCache();
  if (response.ok) {
    const body = await response.clone().text();
    if (!publicRead && epoch !== generation) throw new DOMException('Cache invalidated', 'AbortError');
    try {
      const data: unknown = JSON.parse(body);
      if (data && typeof data === 'object' && !('ok' in data && data.ok === false)) {
        const timestamp = Number(response.headers.get('X-Data-Captured-At'));
        save(key, { body, capturedAt: timestamp > 0 && timestamp <= Date.now() ? timestamp : Date.now() });
      }
    } catch {
      /* Invalid JSON never poisons the cache. */
    }
  }
  return response;
}

export function capturedAt(response: Response): number {
  return Number(response.headers.get('X-Data-Captured-At')) || Date.now();
}
