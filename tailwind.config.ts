import type { Config } from 'tailwindcss';

/**
 * "Modern Dune" design system: sci-fi brutalism meets high-end SaaS.
 *
 * Tailwind v4 loads this through `@config` in `src/app/globals.css`.
 * Rules of the system:
 *  - Obsidian is the canvas, Sand is the paper, Spice is the only loud colour.
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
        /** Deep-space canvas. 950 === Tailwind zinc-950 so `bg-zinc-950` and `bg-obsidian-950` agree. */
        obsidian: {
          50: '#f4f4f5',
          100: '#e4e4e7',
          200: '#c9c9cf',
          300: '#a1a1aa',
          400: '#71717a',
          500: '#52525b',
          600: '#3f3f46',
          700: '#2a2a30',
          800: '#1c1c21',
          900: '#121215',
          950: '#09090b',
        },
        /** Muted desert sand: panels, body copy, hairlines. */
        sand: {
          50: '#faf6ee',
          100: '#f1e9d8',
          200: '#e3d6b9',
          300: '#d1bf96',
          400: '#bba374',
          500: '#a08a5c',
          600: '#7f6c47',
          700: '#5f5136',
          800: '#41382a',
          900: '#2a241b',
          950: '#17140f',
        },
        /** Spice Melange: primary CTAs, active states, accents. */
        spice: {
          50: '#fff8eb',
          100: '#ffecc6',
          200: '#ffd88a',
          300: '#ffbf4d',
          400: '#f9a11f',
          500: '#ee8209',
          600: '#d26104',
          700: '#ae4508',
          800: '#8d370d',
          900: '#742f0e',
          950: '#431603',
        },
        /** Ibad blue: the single cool counterpoint, used sparingly for info and links. */
        ibad: {
          300: '#8fb4e8',
          400: '#5f93d9',
          500: '#3f74bf',
          600: '#2f5a98',
        },
        /** Semantic status colours, desaturated to sit on obsidian. */
        status: {
          ok: '#7fa66a',
          warn: '#f9a11f',
          danger: '#c8503c',
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

export default config;
