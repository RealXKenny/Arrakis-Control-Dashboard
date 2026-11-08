import type { InputHTMLAttributes } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };

/** Labelled input in the Modern Dune style: square edges, obsidian well, spice focus ring, no glow. */
export function AuthField({ label, hint, error, id, className = '', ...input }: FieldProps) {
  const fieldId = id ?? `field-${input.name}`;
  const describedBy = [hint ? `${fieldId}-hint` : '', error ? `${fieldId}-error` : ''].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-300">
        {label}
      </label>
      <input
        id={fieldId}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={`h-11 w-full border border-sand-200/20 bg-obsidian-900 px-3 text-sm text-sand-50 placeholder:text-sand-600 focus:border-spice-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spice-400 disabled:cursor-not-allowed disabled:border-sand-200/10 disabled:bg-obsidian-950 disabled:text-sand-400 ${
          error ? 'border-red-400' : ''
        } ${className}`}
        {...input}
      />
      {hint && (
        <p id={`${fieldId}-hint`} className="text-xs text-sand-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
