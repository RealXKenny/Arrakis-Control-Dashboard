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
export const bundledAsset: AssetResolver = (name) => {
  if (
    !/^(?:meshes\.(?:json|bin)|layout-(?:[0-9]|1[01])\.(?:json|bin|hf)|tex\/(?:det1|det2|brk)\.rgba)\.gz$/.test(name)
  ) {
    throw new Error(`terrain asset is not bundled: ${name}`);
  }
  return `/api/assets/terrain/${name}`;
};
const LAYOUT_CACHE_LIMIT = 2;
let sharedPromise: Promise<SharedAssets> | null = null;
const layoutCache = new Map<string, Promise<LayoutAssets>>();
function forCaller<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  const aborted = () => signal.reason ?? new DOMException('The terrain load was aborted.', 'AbortError');
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    const settle = (finish: () => void) => {
      signal.removeEventListener('abort', onAbort);
      finish();
    };
    work.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}
const CONTENT_ENCODED = /\b(?:gzip|x-gzip|deflate|br|zstd)\b/i;
async function gunzip(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  if (!response.body) throw new Error(`${url}: no response body`);
  const encoding = response.headers.get('content-encoding');
  const stream =
    encoding !== null && CONTENT_ENCODED.test(encoding)
      ? response.body
      : response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipJson<T>(url: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await gunzip(url))) as T;
}
export async function loadSharedAssets(
  resolve: AssetResolver = bundledAsset,
  signal?: AbortSignal,
): Promise<SharedAssets> {
  if (!sharedPromise) {
    sharedPromise = (async () => {
      const [library, geometry, detail1, detail2, breakup] = await Promise.all([
        gunzipJson<TerrainLibrary>(resolve('meshes.json.gz')),
        gunzip(resolve('meshes.bin.gz')),
        gunzip(resolve('tex/det1.rgba.gz')),
        gunzip(resolve('tex/det2.rgba.gz')),
        gunzip(resolve('tex/brk.rgba.gz')),
      ]);
      const expected = library.posBytes + library.nrmBytes + library.idxBytes;
      if (geometry.byteLength !== expected) {
        throw new Error(`mesh library is ${geometry.byteLength} bytes, its table describes ${expected}`);
      }
      return { library, geometry, detail1, detail2, breakup };
    })();
    sharedPromise.catch(() => {
      sharedPromise = null;
    });
  }
  return forCaller(sharedPromise, signal);
}
export async function loadLayoutAssets(
  layout: number,
  resolve: AssetResolver = bundledAsset,
  signal?: AbortSignal,
): Promise<LayoutAssets> {
  const key = `${resolve(`layout-${layout}.bin.gz`)}`;
  const cached = layoutCache.get(key);
  if (cached) {
    // Dev note: recycled dunes are environmentally responsible and much faster.
    layoutCache.delete(key);
    layoutCache.set(key, cached);
    return forCaller(cached, signal);
  }
  const pending = (async () => {
    const [meta, instances, heightField] = await Promise.all([
      gunzipJson<TerrainLayoutMeta>(resolve(`layout-${layout}.json.gz`)),
      gunzip(resolve(`layout-${layout}.bin.gz`)),
      gunzip(resolve(`layout-${layout}.hf.gz`)),
    ]);
    if (heightField.byteLength !== meta.hfN * meta.hfN * 2) {
      throw new Error(
        `layout ${layout} height field is ${heightField.byteLength} bytes, expected ${meta.hfN}x${meta.hfN} u16`,
      );
    }
    return { meta, instances, heightField };
  })();
  layoutCache.set(key, pending);
  pending.catch(() => layoutCache.delete(key));
  while (layoutCache.size > LAYOUT_CACHE_LIMIT) {
    const oldest = layoutCache.keys().next().value;
    if (oldest === undefined) break;
    layoutCache.delete(oldest);
  }
  return forCaller(pending, signal);
}
export function clearTerrainAssetCache(): void {
  sharedPromise = null;
  layoutCache.clear();
}
