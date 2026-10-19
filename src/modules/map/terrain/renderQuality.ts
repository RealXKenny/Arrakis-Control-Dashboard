export type QualityChoice = 'auto' | 'low' | 'balanced' | 'high';
export type RenderQuality = {
  level: Exclude<QualityChoice, 'auto'>;
  gridSize: number;
  textureSize: number;
  pixelRatio: number;
  rockTriangles: number;
  minRockPixels: number;
};

export function renderQuality(
  choice: QualityChoice,
  device: { software: boolean; mobile: boolean; maxTextureSize: number; pixelRatio: number },
): RenderQuality {
  // Capabilities are a conservative default, not a promise of GPU speed.
  const level =
    choice === 'auto'
      ? device.software || device.maxTextureSize < 4096
        ? 'low'
        : device.mobile
          ? 'balanced'
          : 'high'
      : choice;
  const profiles = {
    low: { gridSize: 257, textureSize: 2048, pixelRatio: 1, rockTriangles: 250000, minRockPixels: 6 },
    balanced: { gridSize: 513, textureSize: 2048, pixelRatio: 1.5, rockTriangles: 750000, minRockPixels: 4 },
    high: { gridSize: 1025, textureSize: 4096, pixelRatio: 2, rockTriangles: 1800000, minRockPixels: 2 },
  };
  return {
    level,
    ...profiles[level],
    textureSize: Math.min(profiles[level].textureSize, device.maxTextureSize),
    pixelRatio: Math.min(profiles[level].pixelRatio, device.pixelRatio || 1),
  };
}
