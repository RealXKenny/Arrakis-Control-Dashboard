import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import {
  ArrowRightIcon,
  BaseIcon,
  BroadcastIcon,
  GuildIcon,
  MapIcon,
  MarketIcon,
  UploadIcon,
  VehicleIcon,
} from './_components/icons';
import { SIGN_IN_HREF } from './_components/nav-config';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

function FeatureCard({
  icon: Icon,
  title,
  href,
  className = '',
  children,
}: {
  icon: IconType;
  title: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`panel panel-interactive group flex flex-col gap-4 p-6 sm:p-8 ${className}`}>
      <div className="flex items-start justify-between">
        <Icon className="size-8 text-spice-400" />
        <ArrowRightIcon className="size-5 text-sand-600 transition-colors group-hover:text-spice-400" />
      </div>
      <h3 className="text-base tracking-monolith">{title}</h3>
      {children}
    </Link>
  );
}

/** Decorative 5x5 grid mirroring the Market's strict layout. */
function MarketGridPreview() {
  const hot = new Set([2, 6, 12, 18, 22]);
  return (
    <div aria-hidden="true" className="mt-auto grid max-w-56 grid-cols-5 gap-1">
      {Array.from({ length: 25 }, (_, i) => (
        <span
          key={i}
          className={`aspect-square border ${hot.has(i) ? 'border-spice-500 bg-spice-500/25' : 'border-sand-200/10 bg-sand-100/[0.03]'}`}
        />
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-sand-200/10">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-grid bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-horizon" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-noise opacity-[0.035] mix-blend-screen" />

        <div className="mx-auto grid max-w-shell gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-7">
            <Eyebrow>Arrakis Control // Version 2</Eyebrow>
            <h1 className="mt-6 text-4xl leading-[1.05] sm:text-6xl lg:text-7xl motion-safe:animate-rise">
              Command the
              <span className="block text-spice-500">Deep Desert</span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-sand-300 sm:text-lg">
              One console for your Dune: Awakening holdings. Track the live map, trade on the CHOAM market, manage
              vehicle access, and share base designs with the whole community.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href={SIGN_IN_HREF} prefetch={false} className="btn btn-primary">
                Sign in with Discord
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link href="/bases" className="btn btn-ghost">
                Browse base marketplace
              </Link>
            </div>
          </div>

          {/* Visor telemetry panel (illustrative preview, not live data) */}
          <aside className="lg:col-span-5" aria-label="Console preview">
            <div className="panel p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Console Preview</span>
                <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
                  <span className="size-2 rounded-full bg-status-ok" />
                  Illustrative
                </span>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-px bg-sand-200/10">
                {[
                  ['Sector', 'Hagga Basin'],
                  ['Holdings', '03 Bases'],
                  ['Fleet', '07 Vehicles'],
                  ['Market', '25 Listings'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-obsidian-900 p-4">
                    <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{k}</dt>
                    <dd className="mt-2 text-lg font-extrabold uppercase tracking-wide text-sand-50">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 h-1.5 w-full bg-sand-200/10">
                <div className="h-full w-2/3 bg-spice-500" />
              </div>
              <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
                Sandworm activity: low
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* BENTO FEATURES */}
      <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 lg:py-28" aria-labelledby="features-heading">
        <Eyebrow>Capabilities</Eyebrow>
        <h2 id="features-heading" className="mt-4 max-w-2xl text-2xl sm:text-4xl">
          Everything the Landsraad would hide
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-6 lg:grid-cols-12">
          <FeatureCard
            icon={BaseIcon}
            title="Base Marketplace"
            href="/bases"
            className="border-spice-500/40 md:col-span-6 lg:col-span-7 lg:row-span-2"
          >
            <p className="max-w-md text-sm leading-relaxed text-sand-300">
              A dedicated tab for the community. Upload your custom base configurations, browse what others built, and
              import the layouts you love.
            </p>
            <div className="mt-auto flex items-center gap-3 pt-6">
              <span className="inline-flex items-center gap-2 border border-spice-500/50 bg-spice-500/10 px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-spice-300">
                <UploadIcon className="size-4" />
                Share a base
              </span>
              <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">New in V2</span>
            </div>
          </FeatureCard>

          <FeatureCard icon={MarketIcon} title="CHOAM Market" href="/market" className="md:col-span-3 lg:col-span-5">
            <p className="text-sm leading-relaxed text-sand-300">
              A strict 5 by 5 grid. Only the listings that matter, with nothing else in the way.
            </p>
            <MarketGridPreview />
          </FeatureCard>

          <FeatureCard
            icon={VehicleIcon}
            title="Vehicle Access"
            href="/vehicles"
            className="md:col-span-3 lg:col-span-5"
          >
            <p className="text-sm leading-relaxed text-sand-300">
              Streamlined access menus. Sharing controls appear only when you actually hold access.
            </p>
          </FeatureCard>

          <FeatureCard icon={MapIcon} title="Live Map" href="/map" className="md:col-span-2 lg:col-span-4">
            <p className="text-sm leading-relaxed text-sand-300">
              Hagga Basin and the Deep Desert, tracked in real time.
            </p>
          </FeatureCard>

          <FeatureCard
            icon={BroadcastIcon}
            title="Changelog Broadcasts"
            href="/changelog"
            className="md:col-span-2 lg:col-span-4"
          >
            <p className="text-sm leading-relaxed text-sand-300">
              Release progress posts straight to Discord with interactive link embeds and buttons.
            </p>
          </FeatureCard>

          <FeatureCard icon={GuildIcon} title="Guild Command" href="/guilds" className="md:col-span-2 lg:col-span-4">
            <p className="text-sm leading-relaxed text-sand-300">Recruit, coordinate, and keep your house in order.</p>
          </FeatureCard>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-sand-200/10 bg-obsidian-900">
        <div className="mx-auto flex max-w-shell flex-col items-start justify-between gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center">
          <div>
            <Eyebrow>Join the Sietch</Eyebrow>
            <h2 className="mt-4 text-2xl sm:text-3xl">The spice must flow</h2>
            <p className="mt-3 max-w-lg text-sm text-sand-400">
              Sign in with Discord. Access is verified against your server role.
            </p>
          </div>
          <Link href={SIGN_IN_HREF} prefetch={false} className="btn btn-primary shrink-0">
            Sign in with Discord
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
