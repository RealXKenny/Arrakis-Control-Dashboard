export type TerrainSupport =
  | {
      supported: true;
    }
  | {
      supported: false;
      reason: string;
    };
export type TerrainSupportDeps = {
  hasDecompressionStream: () => boolean;
};
const defaultDeps: TerrainSupportDeps = {
  hasDecompressionStream: () => typeof DecompressionStream !== 'undefined',
};
export function probeTerrainSupport(deps: Partial<TerrainSupportDeps> = {}): TerrainSupport {
  const { hasDecompressionStream } = { ...defaultDeps, ...deps };
  if (!hasDecompressionStream()) {
    return { supported: false, reason: 'no DecompressionStream' };
  }
  // Dev note: one canvas per customer; the GPU bouncer dislikes Strict Mode twins.
  return { supported: true };
}
