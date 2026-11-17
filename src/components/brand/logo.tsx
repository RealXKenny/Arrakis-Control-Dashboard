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

/** The logo with its circular version badge for the header. */
export function BrandLockup({
  size = 'default',
  badgeClassName = 'hidden min-[1840px]:inline-block',
}: {
  size?: 'default' | 'large';
  /** Visibility of the badge. The header hides it on narrow screens. */
  badgeClassName?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <Logo size={size} />
      <span
        className={`size-8 shrink-0 rounded-full border border-spice-500/45 bg-spice-500/5 text-center font-mono text-[0.625rem] leading-[30px] uppercase tracking-wider text-spice-300 ${badgeClassName}`}
      >
        v2
      </span>
    </span>
  );
}

export function Logo({ className = '', size = 'default' }: { className?: string; size?: 'default' | 'large' }) {
  const large = size === 'large';
  return (
    <span className={`inline-flex items-center ${large ? 'gap-2.5 min-[400px]:gap-4' : 'gap-3'} ${className}`}>
      <LogoMark
        className={large ? 'size-9 min-[1840px]:size-11 drop-shadow-[0_0_12px_rgb(240_160_32/0.2)]' : 'size-8'}
      />
      {/* Under 480px the header keeps only the mark so Home, sound, notifications and the menu keep full-size touch targets. */}
      <span className={`flex flex-col leading-none ${large ? 'max-[479px]:hidden' : ''}`}>
        <span
          className={`${large ? 'text-base tracking-[0.14em] min-[400px]:text-lg min-[400px]:tracking-[0.2em] min-[1840px]:text-xl min-[1840px]:tracking-[0.22em]' : 'text-sm tracking-monolith'} font-extrabold uppercase text-sand-50`}
        >
          Arrakis
        </span>
        <span
          className={`mt-1.5 font-mono uppercase ${large ? 'text-[0.6875rem] tracking-[0.3em] min-[400px]:tracking-[0.4em]' : 'text-[0.625rem] tracking-stark'} text-spice-400`}
        >
          Control
        </span>
      </span>
    </span>
  );
}
