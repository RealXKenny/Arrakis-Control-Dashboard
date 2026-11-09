import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Base>
);

export const MapIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />
  </Base>
);

export const CasinoIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4h16v16H4z" />
    <circle cx="8.5" cy="8.5" r="1" />
    <circle cx="15.5" cy="8.5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="8.5" cy="15.5" r="1" />
    <circle cx="15.5" cy="15.5" r="1" />
  </Base>
);

export const MarketIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
  </Base>
);

export const VehicleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 16V11l3-5h9l4 5h2v5h-2M3 16h3M9 16h6" />
    <circle cx="7.5" cy="17" r="2" />
    <circle cx="17.5" cy="17" r="2" />
  </Base>
);

export const BaseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 21V10l9-6 9 6v11zM9 21v-7h6v7" />
  </Base>
);

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </Base>
);

export const BroadcastIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10v4l12 5V5zM16 9a4 4 0 010 6M7 15v5" />
  </Base>
);

export const GuildIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
  </Base>
);

export const MenuIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 9l5 5 5-5" />
  </Base>
);

export const PortalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z" />
  </Base>
);

export const CharacterIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-2a8 8 0 0116 0v2" />
  </Base>
);

export const AssetsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3L3 8l9 5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
  </Base>
);

export const StorageIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />
  </Base>
);

export const PreviewIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </Base>
);

export const MoreIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Base>
);

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />
  </Base>
);

export const BellIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 16V9a6 6 0 0112 0v7l2 3H4zM10 21h4" />
  </Base>
);

export const SignOutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
  </Base>
);

/** Filled brand glyph (not the stroke style used by the rest of the set). */
export const DiscordIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);
