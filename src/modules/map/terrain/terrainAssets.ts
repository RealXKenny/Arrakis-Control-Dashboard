import type { TerrainLayoutMeta, TerrainLibrary } from './types';

export type SharedAssets = {
  library: TerrainLibrary;
  geometry: Uint8Array;
  detail1: Uint8Array;
  detail2: Uint8Array;
  breakup: Uint8Array;
};

export type LayoutAssets = {
  meta: TerrainLayoutMeta;
  instances: Uint8Array;
  heightField: Uint8Array;
};

export type AssetResolver = (name: string) => string;
export const bundledAsset: AssetResolver = (name) => `/maps/terrain/${name}`;

const CONTENT_ENCODED = /\b(?:gzip|x-gzip|deflate|br|zstd)\b/i;
const LAYOUT_CACHE_LIMIT = 2;
let sharedPromise: Promise<SharedAssets> | null = null;
const layoutCache = new Map<string, Promise<LayoutAssets>>();

async function gunzip(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  if (!response.body) throw new Error(`${url}: no response body`);
  const encoding = response.headers.get('content-encoding');
  const stream =
    encoding && CONTENT_ENCODED.test(encoding)
      ? response.body
      : response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipJson<T>(url: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await gunzip(url))) as T;
}

function forCaller<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function loadSharedAssets(resolve: AssetResolver = bundledAsset, signal?: AbortSignal): Promise<SharedAssets> {
  if (!sharedPromise) {
    sharedPromise = Promise.all([
      gunzipJson<TerrainLibrary>(resolve('meshes.json.gz')),
      gunzip(resolve('meshes.bin.gz')),
      gunzip(resolve('tex/det1.bin.gz')),
      gunzip(resolve('tex/det2.bin.gz')),
      gunzip(resolve('tex/brk.bin.gz')),
    ]).then(([library, geometry, detail1, detail2, breakup]) => {
      const expected = library.posBytes + library.nrmBytes + library.idxBytes;
      if (geometry.byteLength !== expected)
        throw new Error(`mesh library is ${geometry.byteLength} bytes; expected ${expected}`);
      return { library, geometry, detail1, detail2, breakup };
    });
    sharedPromise.catch(() => {
      sharedPromise = null;
    });
  }
  return forCaller(sharedPromise, signal);
}

export function loadLayoutAssets(
  layout: number,
  resolve: AssetResolver = bundledAsset,
  signal?: AbortSignal,
): Promise<LayoutAssets> {
  const key = resolve(`layout-${layout}.bin.gz`);
  const cached = layoutCache.get(key);
  if (cached) return forCaller(cached, signal);
  const pending = Promise.all([
    gunzipJson<TerrainLayoutMeta>(resolve(`layout-${layout}.json.gz`)),
    gunzip(resolve(`layout-${layout}.bin.gz`)),
    gunzip(resolve(`layout-${layout}.hf.gz`)),
  ]).then(([meta, instances, heightField]) => {
    if (heightField.byteLength !== meta.hfN * meta.hfN * 2)
      throw new Error(`layout ${layout} height field has an invalid size`);
    return { meta, instances, heightField };
  });
  layoutCache.set(key, pending);
  pending.catch(() => layoutCache.delete(key));
  while (layoutCache.size > LAYOUT_CACHE_LIMIT) {
    const oldest = layoutCache.keys().next().value;
    if (oldest) layoutCache.delete(oldest);
    else break;
  }
  return forCaller(pending, signal);
}
