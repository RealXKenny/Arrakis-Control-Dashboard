import type { ReactNode } from 'react';

/** Shared V2 form styling: sharp corners, sand text on obsidian, Spice focus. */
export const inputClass =
  'w-full border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm text-sand-50 placeholder:text-sand-600 focus:border-spice-400 disabled:opacity-50';

export const dangerButton = 'btn border border-status-danger bg-status-danger/15 text-sand-50 disabled:opacity-50';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-sand-500">{hint}</span>}
    </label>
  );
}

export function CheckField({
  label,
  checked,
  required,
  onChange,
}: {
  label: string;
  checked: boolean;
  required?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-sand-100">
      <input
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-spice-500"
      />
      {label}
    </label>
  );
}

export function FormMessage({ error, status }: { error?: string; status?: string }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="border-l-4 border-l-status-danger bg-status-danger/10 px-3 py-2 text-sm text-sand-100"
        >
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="border-l-4 border-l-status-ok bg-status-ok/10 px-3 py-2 text-sm text-sand-100">
          {status}
        </p>
      )}
    </>
  );
}

export function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread messages`}
      className="inline-flex min-h-5 min-w-5 items-center justify-center bg-status-danger px-1 font-mono text-[0.625rem] font-bold leading-none text-sand-50"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
