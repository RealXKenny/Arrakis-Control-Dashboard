import type { Config } from 'tailwindcss';

/**
 * Console-style default palette with stable Obsidian/Sand/Spice utility names.
 *
 * Tailwind v4 loads this through `@config` in `src/app/globals.css`.
 * Rules of the system:
 *  - Shared CSS roles drive the default and all browser appearance choices.
 *  - Corners are sharp (radius 0). Depth comes from hard, unblurred shadows,
 *    like low desert sun, never from neon glow.
 *  - Headers are wide-tracked and uppercase to read as monolithic.
 */
const config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/ui/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    // Sharp corners everywhere; `full` survives for status dots only.
    borderRadius: {
      none: '0',
      sm: '0',
      DEFAULT: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      full: '9999px',
    },
    extend: {
      colors: {
        /** Graphite Console canvas, panels and raised surfaces. */
        obsidian: {
          50: '#f5f6f7',
          100: '#e6e9eb',
          200: '#cbd0d5',
          300: '#a4abb1',
          400: '#7f878f',
          500: '#565d66',
          600: '#42474e',
          700: '#2b3035',
          800: '#202428',
          900: '#171a1d',
          950: '#0d0f12',
        },
        /** Muted desert sand: panels, body copy, hairlines. */
        sand: {
          50: '#fff1d4',
          100: '#f3efe7',
          200: '#e6e0d6',
          300: '#ceb894',
          400: '#ad9f89',
          500: '#9f9586',
          600: '#7f705a',
          700: '#5f503f',
          800: '#423a30',
          900: '#2d271f',
          950: '#1b1713',
        },
        /** Spice Melange: primary CTAs, active states, accents. */
        spice: {
          50: '#fff6e8',
          100: '#ffedd4',
          200: '#ffdeb2',
          300: '#ffd08a',
          400: '#d49a5c',
          500: '#c68b4a',
          600: '#b87b3f',
          700: '#9b5f2a',
          800: '#8d5328',
          900: '#683d20',
          950: '#3e2415',
        },
        /** Ibad blue: the single cool counterpoint, used sparingly for info and links. */
        ibad: {
          300: '#b5d4f0',
          400: '#85b7eb',
          500: '#6196ce',
          600: '#4775a5',
        },
        /** Semantic status colours, desaturated to sit on obsidian. */
        status: {
          ok: '#9be6bd',
          warn: '#ffd08a',
          danger: '#ffb4a8',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        /** Monolithic headers. */
        monolith: '0.18em',
        /** Eyebrows and micro-labels. */
        stark: '0.32em',
      },
      boxShadow: {
        /** Harsh, unblurred "high noon" shadows. */
        sun: '6px 6px 0 0 rgb(0 0 0 / 0.6)',
        'sun-sm': '3px 3px 0 0 rgb(0 0 0 / 0.6)',
        'sun-spice': '6px 6px 0 0 rgb(174 69 8 / 0.9)',
        /** Fremen visor: 1px inner highlight on the top edge. */
        visor: 'inset 0 1px 0 0 rgb(241 233 216 / 0.08)',
      },
      backgroundImage: {
        /** Architectural blueprint grid. */
        grid: 'linear-gradient(to right, rgb(241 233 216 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(241 233 216 / 0.045) 1px, transparent 1px)',
        /** Low sun on the horizon, flat banding rather than a soft glow. */
        horizon: 'linear-gradient(to bottom, transparent 0%, rgb(238 130 9 / 0.1) 100%)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      maxWidth: {
        shell: '80rem',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;

// Shared CSS properties drive utilities and feature modules alike. Fallbacks preserve the baseline without JS.
for (const [group, shades] of Object.entries(config.theme.extend.colors)) {
  for (const [shade, color] of Object.entries(shades)) {
    (shades as Record<string, string>)[shade] = `var(--color-${group}-${shade}, ${color})`;
  }
}
export default config;
