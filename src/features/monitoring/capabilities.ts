export type CapabilityState = 'available' | 'permission' | 'unsupported' | 'rate-limited' | 'unavailable';
export type CapabilityReading = {
  id: 'server-status' | 'restart-queue' | 'population';
  label: string;
  state: CapabilityState;
  checkedAt: string;
  lastSuccessAt: string | null;
};
