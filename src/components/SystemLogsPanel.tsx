import type { SystemLogEntry, SystemLogLevel } from '../lib/types';

const LEVEL_STYLES: Record<SystemLogLevel, string> = {
  info: 'border-edge bg-panel text-zinc-400',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  error: 'border-red-400/30 bg-red-400/10 text-red-400',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString('en-GB', { hour12: false });
}

export default function SystemLogsPanel({ logs }: { logs: SystemLogEntry[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-edge bg-panel">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">System logs</h2>
        <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-zinc-500 tabular-nums">
          {logs.length} entries
        </span>
      </header>
      {logs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">No system actions recorded yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-edge overflow-y-auto font-mono text-xs">
          {logs.map((log) => (
            <li key={log.id} className="flex items-baseline gap-3 px-4 py-2">
              <time className="shrink-0 text-zinc-600">{formatTime(log.at)}</time>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${LEVEL_STYLES[log.level]}`}
              >
                {log.level}
              </span>
              <span className="shrink-0 text-zinc-500">{log.source}</span>
              <span className="text-zinc-300">{log.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
