import Image from 'next/image';
import Link from 'next/link';
import ChangelogDialog from '../../changelog/components/ChangelogDialog';
import { useServerStatus } from '../hooks/useServerStatus';

const number = new Intl.NumberFormat('en-US');

type IconName = 'server' | 'spice' | 'market' | 'population' | 'map' | 'character' | 'bases' | 'community';

const ICON_PATHS: Record<IconName, string[]> = {
  server: ['M4 5h16v5H4z', 'M4 14h16v5H4z', 'M8 7.5h.01', 'M8 16.5h.01', 'M12 7.5h4', 'M12 16.5h4'],
  spice: ['M4 18c4-6 12-6 16 0', 'M6 14c3-4 9-4 12 0', 'M12 3v4', 'M5 6l2 2', 'M19 6l-2 2'],
  market: ['M4 7h16l-1 13H5L4 7Z', 'M8 7a4 4 0 0 1 8 0', 'M8 12h8'],
  population: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M22 19H2'],
  map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z', 'M9 3v15', 'M15 6v15'],
  character: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
  bases: ['m3 11 9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  community: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
};

function ModuleIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function ActionPill({
  href,
  children,
  external = false,
  primary = false,
}: {
  href: string;
  children: string;
  external?: boolean;
  primary?: boolean;
}) {
  const className = primary
    ? 'inline-flex items-center justify-center action-primary rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-300 no-underline transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/15 hover:text-indigo-200'
    : 'inline-flex items-center justify-center rounded-full border border-white/5 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 no-underline transition-colors hover:bg-zinc-700 hover:text-zinc-100';
  // OAuth starts on an intentional navigation, never a Next.js background prefetch.
  return external || href.startsWith('/auth/') ? (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={className}
    >
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function DataModule({
  icon,
  title,
  description,
  detail,
  href,
}: {
  icon: IconName;
  title: string;
  description: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-56 flex-col rounded-3xl border border-white/5 bg-zinc-900/40 p-6 no-underline transition-colors hover:border-white/10 hover:bg-zinc-900/60"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
          <ModuleIcon name={icon} />
        </span>
        <span className="text-zinc-600 transition-colors group-hover:text-zinc-300" aria-hidden="true">
          ↗
        </span>
      </div>
      <h3 className="mt-6 text-base font-medium text-zinc-200">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
      <span className="mt-auto pt-5 text-xs font-medium text-zinc-400">{detail}</span>
    </Link>
  );
}

export default function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  const connected = !serverStatusError && activePlayers != null;
  return (
    <div className="relative min-h-screen overflow-x-clip bg-zinc-950 font-sans text-zinc-200 antialiased">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(129,140,248,0.07),transparent_52%)]"
        aria-hidden="true"
      />
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:border focus:border-indigo-500/20 focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:text-zinc-100"
      >
        Skip to content
      </a>
      <div className="relative flex min-h-screen flex-col">
        <header className="workspace-frame sticky top-0 z-50 bg-gradient-to-b from-zinc-950 via-zinc-950/90 to-transparent pt-4 pb-2 sm:pt-6">
          <nav
            aria-label="Public navigation"
            className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/5 bg-zinc-900/50 p-2 pl-3 backdrop-blur-md"
          >
            <Link href="/" className="flex min-w-0 items-center gap-3 rounded-full no-underline">
              <Image
                src="/favicon.ico"
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 shrink-0 rounded-full border border-white/5"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-zinc-100">Crimson Skies</span>
                <span className="hidden text-[11px] text-zinc-500 sm:block">Community workspace</span>
              </span>
            </Link>
            <div className="hidden items-center gap-1 lg:flex">
              <a
                href="#modules"
                className="rounded-full px-4 py-2 text-xs text-zinc-400 no-underline transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Modules
              </a>
              <a
                href="#live-map"
                className="rounded-full px-4 py-2 text-xs text-zinc-400 no-underline transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Live map
              </a>
              <a
                href="#community"
                className="rounded-full px-4 py-2 text-xs text-zinc-400 no-underline transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Community
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <ActionPill href="https://discord.gg/crimsonskies" external>
                  Join Discord
                </ActionPill>
              </span>
              {!isAuthenticated && <ActionPill href="/auth/login">Connect Discord</ActionPill>}
              <ActionPill href="/portal" primary>
                Open portal ↗
              </ActionPill>
            </div>
          </nav>
        </header>

        <main id="dashboard-content" className="workspace-frame flex-1 py-6 sm:py-8 lg:py-10">
          <div className="grid gap-4 xl:grid-cols-12">
            <section className="flex flex-col justify-between rounded-3xl border border-white/5 bg-zinc-900/40 p-6 sm:p-8 lg:p-10 xl:col-span-7">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/5 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
                    Arrakis control dashboard
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/5 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${serverStatusError ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                      aria-hidden="true"
                    />
                    {serverStatusError ? 'Telemetry unavailable' : connected ? 'Server connected' : 'Reading server…'}
                  </span>
                </div>
                <h1 className="mt-8 max-w-3xl text-5xl leading-[1.04] font-semibold tracking-[-0.055em] text-zinc-100 sm:text-6xl lg:text-7xl">
                  A clearer view.
                  <br />
                  <span className="text-zinc-500">More possibilities.</span>
                </h1>
                <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                  Character progress, community holdings, market activity, and live world data in one calm, connected
                  workspace.
                </p>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                {!isAuthenticated && (
                  <a
                    href="/auth/login"
                    className="inline-flex items-center justify-center action-primary rounded-full border border-indigo-500/20 bg-indigo-500/10 px-5 py-2.5 text-sm font-medium text-indigo-300 no-underline transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/15 hover:text-indigo-200"
                  >
                    Connect with Discord →
                  </a>
                )}
                <Link
                  href="/portal"
                  className="inline-flex items-center justify-center rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-zinc-700 hover:text-zinc-100"
                >
                  Open your portal ↗
                </Link>
                <span className="text-xs text-zinc-600">Verified Discord access · Private by default</span>
              </div>
            </section>

            <section
              id="live-map"
              aria-labelledby="live-map-title"
              className="flex flex-col rounded-3xl border border-white/5 bg-zinc-900/40 p-6 sm:p-8 xl:col-span-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">World intelligence</span>
                  <h2 id="live-map-title" className="mt-2 text-xl font-medium tracking-tight text-zinc-100">
                    Explore Arrakis live
                  </h2>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
                  <ModuleIcon name="map" />
                </span>
              </div>
              <div className="relative mt-6 min-h-52 flex-1 overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60">
                <svg
                  viewBox="0 0 640 280"
                  className="absolute inset-0 h-full w-full text-zinc-700"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M0 56h640M0 112h640M0 168h640M0 224h640" stroke="currentColor" opacity=".2" />
                  <path
                    d="M80 0v280M160 0v280M240 0v280M320 0v280M400 0v280M480 0v280M560 0v280"
                    stroke="currentColor"
                    opacity=".2"
                  />
                  <path
                    d="M-20 230c94-20 98-92 188-86 82 6 82 74 168 54 86-19 104-110 188-96 54 9 70 48 136 40"
                    stroke="currentColor"
                    opacity=".55"
                  />
                  <path
                    d="M-10 252c100-22 128-74 200-68 84 7 104 58 180 36 76-21 106-86 176-76 48 7 64 32 104 30"
                    stroke="currentColor"
                    opacity=".35"
                  />
                  <circle cx="242" cy="142" r="6" fill="#818cf8" fillOpacity=".65" />
                  <circle cx="242" cy="142" r="14" stroke="#818cf8" strokeOpacity=".2" />
                  <circle cx="486" cy="104" r="5" fill="#a1a1aa" fillOpacity=".6" />
                  <circle cx="486" cy="104" r="12" stroke="#a1a1aa" strokeOpacity=".18" />
                </svg>
                <div className="absolute right-4 bottom-4 left-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Terrain-aware world maps</p>
                    <p className="mt-1 text-xs text-zinc-500">Live objects, bases, spice, wrecks, and sectors</p>
                  </div>
                  <span className="rounded-full border border-white/5 bg-zinc-900/80 px-3 py-1 text-[11px] text-zinc-400">
                    2D + 3D
                  </span>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/portal?view=hagga"
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 no-underline transition-colors hover:bg-zinc-700 hover:text-zinc-100"
                >
                  Hagga Basin
                </Link>
                <Link
                  href="/portal?view=deep-desert"
                  className="inline-flex flex-1 items-center justify-center action-primary rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 text-xs font-medium text-indigo-300 no-underline transition-colors hover:bg-indigo-500/15"
                >
                  Deep Desert ↗
                </Link>
              </div>
            </section>
          </div>

          <section id="modules" aria-labelledby="modules-title" className="mt-12 scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Connected operations</p>
                <h2 id="modules-title" className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
                  The signal, without the noise
                </h2>
              </div>
              <p className="max-w-md text-xs leading-5 text-zinc-500">
                Live public status here. Detailed world and market readings stay inside your verified workspace.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Link
                href="/portal"
                aria-label="Open live server activity"
                className="group flex min-h-56 flex-col rounded-3xl border border-white/5 bg-zinc-900/40 p-6 no-underline transition-colors hover:border-white/10 hover:bg-zinc-900/60"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
                    <ModuleIcon name="server" />
                  </span>
                  <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden="true" />
                    Live activity
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-medium tracking-tight text-zinc-100 tabular-nums">
                      {activePlayers == null ? '—' : number.format(activePlayers)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Players online</p>
                  </div>
                  <div>
                    <p className="text-3xl font-medium tracking-tight text-zinc-100 tabular-nums">
                      {totalPlayers == null ? '—' : number.format(totalPlayers)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Community characters</p>
                  </div>
                </div>
                <span className="mt-auto pt-5 text-xs font-medium text-zinc-400">Server status ↗</span>
              </Link>
              <DataModule
                icon="spice"
                title="Spice sectors"
                description="Follow current sector activity and field locations without losing the surrounding world context."
                detail="Open live spice map ↗"
                href="/portal?view=deep-desert"
              />
              <DataModule
                icon="market"
                title="Market counts"
                description="Review listing counts, available stock, and price signals through the community exchange."
                detail="Browse the exchange ↗"
                href="/portal?view=market"
              />
              <DataModule
                icon="population"
                title="Population history"
                description="Read population trends over time and compare current activity with the recent world rhythm."
                detail="View world telemetry ↗"
                href="/portal"
              />
            </div>
          </section>

          <section
            id="community"
            aria-labelledby="community-title"
            className="mt-12 grid gap-4 scroll-mt-24 lg:grid-cols-12"
          >
            <div className="rounded-3xl border border-white/5 bg-zinc-900/40 p-6 sm:p-8 lg:col-span-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
                <ModuleIcon name="community" />
              </span>
              <h2 id="community-title" className="mt-6 text-2xl font-medium tracking-tight text-zinc-100">
                Built around your community
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                Move from a world signal to the people, bases, and plans behind it. Discord keeps the conversation
                close.
              </p>
              <a
                href="https://discord.gg/crimsonskies"
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-zinc-700"
              >
                Join Crimson Skies ↗
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              <Link
                href="/portal?view=character"
                className="group rounded-3xl border border-white/5 bg-zinc-900/40 p-6 no-underline transition-colors hover:border-white/10 hover:bg-zinc-900/60 sm:p-8"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
                  <ModuleIcon name="character" />
                </span>
                <h3 className="mt-6 text-lg font-medium text-zinc-200">Character & inventory</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Progress, equipment, storage, and personal telemetry.
                </p>
                <span className="mt-6 inline-block text-xs font-medium text-zinc-400">Open character workspace ↗</span>
              </Link>
              <Link
                href="/portal?view=bases"
                className="group rounded-3xl border border-white/5 bg-zinc-900/40 p-6 no-underline transition-colors hover:border-white/10 hover:bg-zinc-900/60 sm:p-8"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-zinc-800/70 text-zinc-400">
                  <ModuleIcon name="bases" />
                </span>
                <h3 className="mt-6 text-lg font-medium text-zinc-200">Bases & vehicles</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Private holdings, base previews, storage, and vehicles.
                </p>
                <span className="mt-6 inline-block text-xs font-medium text-zinc-400">Inspect your holdings ↗</span>
              </Link>
            </div>
          </section>
        </main>

        <footer className="workspace-frame pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5 text-xs text-zinc-600">
            <span>
              Crimson Skies · <ChangelogDialog />
            </span>
            <span>Your community. Connected.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
