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

/** The logo with its version pill. Header and footer share it so the brand reads the same everywhere. */
export function BrandLockup({
  size = 'default',
  badgeClassName = 'hidden min-[1840px]:inline',
}: {
  size?: 'default' | 'large';
  /** Visibility of the pill. The header hides it on narrow screens, the footer always shows it. */
  badgeClassName?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <Logo size={size} />
      <span
        className={`border border-spice-500/45 bg-spice-500/5 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-widest text-spice-300 ${badgeClassName}`}
      >
        v2
      </span>
    </span>
  );
}

export function Logo({ className = '', size = 'default' }: { className?: string; size?: 'default' | 'large' }) {
  const large = size === 'large';
  return (
    <span className={`inline-flex items-center ${large ? 'gap-4' : 'gap-3'} ${className}`}>
      <LogoMark
        className={large ? 'size-9 min-[1840px]:size-11 drop-shadow-[0_0_12px_rgb(240_160_32/0.2)]' : 'size-8'}
      />
      <span className="flex flex-col leading-none">
        <span
          className={`${large ? 'text-lg tracking-[0.2em] min-[1840px]:text-xl min-[1840px]:tracking-[0.22em]' : 'text-sm tracking-monolith'} font-extrabold uppercase text-sand-50`}
        >
          Arrakis
        </span>
        <span
          className={`mt-1.5 font-mono uppercase ${large ? 'text-[0.6875rem] tracking-[0.4em]' : 'text-[0.625rem] tracking-stark'} text-spice-400`}
        >
          Control
        </span>
      </span>
    </span>
  );
}
