export interface UEPosition {
  x: number;
  y: number;
  z: number;
}

export interface UERotator {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface BabylonPosition {
  x: number;
  y: number;
  z: number;
}

// Port of dune-base-market/src/engine/ueTransform.ts for the dashboard's Three.js scene.
// UE5 (X forward=North, Y right=East, Z up) -> Babylon (X=UE_Y, Y=UE_Z, Z=UE_X).
export function ueToBabylonPosition(pos: UEPosition): BabylonPosition {
  return { x: pos.y, y: pos.z, z: pos.x };
}

export function babylonToUEPosition(pos: BabylonPosition): UEPosition {
  return { x: pos.z, y: pos.x, z: pos.y };
}

// The reference viewer stores the export's UE yaw directly.
export function toViewerStoredYaw(_templateId: string, ueYawDeg: number): number {
  return ueYawDeg;
}

// UE -> Babylon yaw constants are copied from the reference engine.
export function ueYawToBabylonYaw(templateId: string, yawDeg: number): number {
  const lc = templateId.toLowerCase();
  if (lc.includes('corner')) return yawDeg + 180;
  if ((lc.includes('top') || lc.includes('bottom')) && (lc.includes('left') || lc.includes('right')))
    return yawDeg + 90;
  if (lc.includes('railing')) return yawDeg + 90;
  return yawDeg - 90;
}

export function uePitchToBabylonPitch(pitchDeg: number): number {
  return -pitchDeg;
}

export function ueRollToBabylonRoll(rollDeg: number): number {
  return rollDeg;
}
