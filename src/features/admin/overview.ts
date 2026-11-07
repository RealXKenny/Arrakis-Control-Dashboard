export type AdminSource = {
  operation: string;
  label: string;
  state: 'ready' | 'error' | 'unconfigured';
  status: number | null;
  durationMs: number;
  error?: string;
};
export type AdminMetric = {
  id: string;
  label: string;
  value: string | number | null;
  unit?: string;
  operation: string;
};
export type AdminOverview = {
  observedAt: string;
  metrics: AdminMetric[];
  services: { name: string; state: string }[];
  sources: AdminSource[];
  setup: { id: string; label: string; ready: boolean; instruction: string }[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
export function snapshotScalar(value: unknown, paths: string[]) {
  for (const root of [value, record(value).data]) {
    for (const path of paths) {
      let candidate: unknown = root;
      for (const name of path.split('.')) candidate = record(candidate)[name];
      if (typeof candidate === 'string' && candidate.length <= 100) return candidate;
      if (
        typeof candidate === 'number' &&
        Number.isFinite(candidate) &&
        (!Number.isInteger(candidate) || Number.isSafeInteger(candidate))
      )
        return candidate;
    }
  }
  return null;
}
export function snapshotRows(value: unknown, names: string[]) {
  if (Array.isArray(value)) return value;
  for (const root of [record(value), record(record(value).data)])
    for (const name of ['rows', ...names]) if (Array.isArray(root[name])) return root[name] as unknown[];
  return null;
}
export function snapshotCount(value: unknown, names: string[], paginated: boolean) {
  const total = snapshotScalar(value, [
    'total',
    'totalCount',
    'totalRows',
    'pagination.total',
    'pagination.totalCount',
  ]);
  if (typeof total === 'number' && Number.isSafeInteger(total) && total >= 0) return total;
  if (typeof total === 'string' && /^\d{1,30}$/.test(total)) return total;
  // Dev note: one scout on page one does not mean the entire sietch has one resident.
  const rows = snapshotRows(value, names);
  return !paginated && rows ? rows.length : null;
}
export function summarizeAdminMetrics(readings: Record<string, unknown>): Pick<AdminOverview, 'metrics' | 'services'> {
  const count = (id: string, label: string, operation: string, names: string[], paginated = true): AdminMetric => ({
    id,
    label,
    operation,
    value: snapshotCount(readings[operation], names, paginated),
  });
  const services = (snapshotRows(readings['get-server-services'], ['services']) ?? []).slice(0, 30).map((value) => {
    const row = record(value);
    return {
      name: String(row.name ?? row.service ?? row.id ?? 'Service').slice(0, 100),
      state: String(
        row.status ??
          row.state ??
          (typeof row.running === 'boolean' ? (row.running ? 'Running' : 'Stopped') : 'Not reported'),
      ).slice(0, 80),
    };
  });
  return {
    services,
    metrics: [
      {
        id: 'health',
        label: 'Server status',
        operation: 'get-server-status',
        value: snapshotScalar(readings['get-server-status'], ['summary.overall', 'overall', 'status', 'state']),
      },
      {
        id: 'cpu',
        label: 'CPU usage',
        operation: 'get-server-performance',
        value: snapshotScalar(readings['get-server-performance'], [
          'cpuPercent',
          'cpu.percent',
          'cpu.usagePercent',
          'system.cpu.percent',
        ]),
        unit: '%',
      },
      {
        id: 'memory',
        label: 'Memory usage',
        operation: 'get-server-performance',
        value: snapshotScalar(readings['get-server-performance'], [
          'memoryPercent',
          'memory.percent',
          'memory.usedPercent',
          'system.memory.percent',
        ]),
        unit: '%',
      },
      count('online', 'Players online', 'get-players-online', ['players']),
      count('players', 'Total players', 'get-players', ['players']),
      count('guilds', 'Guilds', 'get-guilds', ['guilds']),
      count('bases', 'Bases', 'get-bases', ['bases']),
      count('vehicles', 'Vehicles', 'get-vehicles', ['vehicles']),
      count('maps', 'Maps', 'get-maps', ['maps'], false),
      count('backups', 'Game backups', 'get-backups', ['backups'], false),
    ],
  };
}
