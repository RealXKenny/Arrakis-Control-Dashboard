export type CapabilityState = 'available' | 'permission' | 'unsupported' | 'rate-limited' | 'unavailable';
export type CapabilityReading = {
  id:
    | 'server-status'
    | 'readiness'
    | 'services'
    | 'performance'
    | 'restart-queue'
    | 'restart-history'
    | 'restart-schedule'
    | 'ip-change-restart'
    | 'population'
    | 'database-backups'
    | 'system-backups'
    | 'backup-schedule'
    | 'database-backup-schedule';
  label: string;
  state: CapabilityState;
  checkedAt: string;
  lastSuccessAt: string | null;
  stale: boolean;
};
