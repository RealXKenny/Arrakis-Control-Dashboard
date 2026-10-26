export type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  /** Renders a small accent dot marking the metric as live. */
  live?: boolean;
};

export default function MetricCard({ label, value, hint, live = false }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-center gap-2">
        {live ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-100 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
