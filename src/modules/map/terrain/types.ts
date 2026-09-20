export type TerrainMesh = {
  lo: [number, number, number];
  ext: [number, number, number];
  vo: number;
  vn: number;
  io: number;
  ic: number;
};
export type TerrainLibrary = {
  posBytes: number;
  nrmBytes: number;
  idxBytes: number;
  meshes: TerrainMesh[];
};
export type TerrainDraw = {
  m: number;
  off: number;
  n: number;
  overlay: number;
};
export type TerrainLayoutMeta = {
  layout: number;
  nInst: number;
  tris: number;
  zmin: number;
  zmax: number;
  cx: number;
  cy: number;
  half: number;
  floorZ: number;
  hfN: number;
  hfZlo: number;
  hfZhi: number;
  hfStep: number;
  hfX0: number;
  hfY0: number;
  draws: TerrainDraw[];
};
export type TerrainDrawCall = TerrainMesh & {
  instOff: number;
  instN: number;
  overlay: number;
  land: boolean;
};
export type TerrainView = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  flipY: boolean;
};
