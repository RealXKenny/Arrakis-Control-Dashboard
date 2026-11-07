import type { SVGProps } from 'react';

/** Dune-ridge mark. Mirrors `src/app/icon.svg` so the favicon and logo stay one identity. */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...props}>
      <path d="M6 46 L24 18 L34 32 L42 22 L58 46 Z" className="fill-spice-500" />
      <path d="M6 46 L24 18 L24 46 Z" className="fill-spice-700" />
      <rect x="6" y="50" width="52" height="4" className="fill-sand-200" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-extrabold uppercase tracking-monolith text-sand-50">Arrakis</span>
        <span className="mt-1 font-mono text-[0.625rem] uppercase tracking-stark text-spice-400">Control</span>
      </span>
    </span>
  );
}
