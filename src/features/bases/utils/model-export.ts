export type BaseModelFailure = 'unauthorized' | 'forbidden' | 'too-large' | 'unavailable';
export class BaseModelError extends Error {
  constructor(readonly code: BaseModelFailure) {
    super('Base model unavailable');
  }
}

/** Ownership is revalidated by the existing route; private exports never enter a client cache. */
export async function fetchBaseModelExport(id: string, signal: AbortSignal, endpoint?: string): Promise<unknown> {
  signal.throwIfAborted();
  if (!id || id.length > 128) throw new BaseModelError('unavailable');
  const active = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  const response = await fetch(endpoint ?? `/api/bases/${encodeURIComponent(id)}/export`, {
    signal: active,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new BaseModelError(
      response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'unavailable',
    );
  }
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body.cancel();
    throw new BaseModelError('too-large');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      active.throwIfAborted();
      const { done, value } = await reader.read();
      active.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BaseModelError('too-large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
