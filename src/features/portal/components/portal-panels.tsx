import { Card } from '../../../components/ui/card';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cardClass } from '../../../components/ui/control-styles';
import { LocalTime } from '../../../components/ui/local-time';
import { AvatarImage } from '../../../components/ui/avatar-image';
import { ArrowRightIcon } from '../../../components/icons';
import { formatNumber } from '../../../lib/format';
import { timeRemaining, type WorldReading } from '../world';
import type { PortalProfile } from '../view-model';
import type { PortalWidgetId } from '../layout';
import { PopulationChart } from './population-chart';
import { ActivityHeatmap } from './activity-heatmap';

function Stat({ label, value, hint, href }: { label: string; value: string; hint: string; href: string }) {
  return (
    <Link
      data-portal-panel
      href={href}
      className={cardClass({ surface: 'glass', interactive: true, className: 'flex h-full flex-col gap-2 p-5' })}
    >
      <span className="eyebrow">{label}</span>
      <strong className="figure text-3xl font-extrabold text-sand-50">{value}</strong>
      <span className="text-sm text-sand-400">{hint}</span>
    </Link>
  );
}

export function portalPanels(
  profile: PortalProfile | null,
  world: WorldReading | null,
  mapName: string,
): Record<PortalWidgetId, ReactNode> {
  const character = profile?.character;
  // Countdowns are measured from the world reading's own timestamp, keeping the render pure.
  const now = world ? Date.parse(world.observedAt) : 0;
  const spice = world?.spice;
  const council = world?.council;
  const headline = spice
    ? spice.count > 0
      ? spice.sectors.length
        ? `Spice blowing at ${spice.sectors[0]}.`
        : `${spice.count} spice fields active.`
      : 'No active spice fields reported.'
    : 'Live spice conditions are not available.';

  return {
    conditions: (
      <Card
        as="section"
        data-portal-panel
        className="panel flex flex-col p-6 sm:p-8 xl:col-span-8"
        aria-labelledby="conditions"
      >
        <p className="eyebrow">Field conditions · {mapName}</p>
        <h2 id="conditions" className="mt-4 text-xl sm:text-[1.75rem]">
          {headline}
        </h2>
        <p className="mb-8 mt-3 max-w-prose text-base leading-relaxed text-sand-300">
          {spice?.sectors.length
            ? `Spice reported in ${spice.sectors.slice(0, 8).join(', ')}${spice.sectors.length > 8 ? ' and more' : ''}.`
            : 'Sector coordinates were not reported.'}
        </p>
        <dl className="mt-auto grid gap-px bg-sand-200/10 pt-0 sm:grid-cols-2">
          <div className="bg-obsidian-900 p-4">
            <dt className="font-mono text-xs uppercase tracking-widest text-sand-500">Coriolis cycle in</dt>
            <dd className="figure mt-1 text-lg font-bold text-spice-400">
              {timeRemaining(world?.nextCycleAt ?? null, now)}
            </dd>
          </div>
          <div className="bg-obsidian-900 p-4">
            <dt className="font-mono text-xs uppercase tracking-widest text-sand-500">Last reading</dt>
            <dd className="figure mt-1 text-lg font-bold text-sand-100">
              {world ? <LocalTime value={world.observedAt} variant="time" /> : 'Unavailable'}
            </dd>
          </div>
        </dl>
      </Card>
    ),
    character: character ? (
      <Card as="aside" data-portal-panel className="panel p-6 xl:col-span-4" aria-label="Your character">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden bg-obsidian-900 text-xl font-extrabold text-spice-400">
            <AvatarImage
              src={character.avatarUrl}
              width={56}
              height={56}
              className="size-full object-cover"
              fallback={character.name.slice(0, 1).toUpperCase()}
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base">{character.name}</h2>
            <p className="truncate text-sm text-sand-400">{character.guild?.name ?? 'Independent traveller'}</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px bg-sand-200/10">
          {[
            ['Level', formatNumber(character.level, 0)],
            ['Status', character.status],
            ['Faction', character.guild?.faction ?? 'Not reported'],
            ['Guild rank', character.guild?.rank ?? '—'],
          ].map(([k, v]) => (
            <div
              key={k}
              data-portal-guild-detail={k === 'Guild rank' || k === 'Faction' ? 'true' : undefined}
              className="bg-obsidian-900 p-3"
            >
              <dt className="font-mono text-xs uppercase tracking-widest text-sand-500">{k}</dt>
              <dd className="mt-1 truncate text-sm font-bold uppercase text-sand-50">{v}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/character"
          className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-spice-400 hover:text-spice-300"
        >
          Open character <ArrowRightIcon className="size-4" />
        </Link>
      </Card>
    ) : (
      <Card as="aside" data-portal-panel className="panel p-6" aria-label="Your character">
        <h2>Your character</h2>
        <p className="mt-3 text-sand-400">Character details are unavailable.</p>
      </Card>
    ),
    solaris: (
      <Stat
        label="Solari credit"
        value={character ? formatNumber(character.solarisCredit, 0) : 'Unavailable'}
        hint="Personal reserves"
        href="/character"
      />
    ),
    exchange: (
      <Stat
        label="Exchange"
        value={`${formatNumber(world?.market?.listings, 0)} listings`}
        hint={`${formatNumber(world?.market?.items, 0)} item types`}
        href="/market"
      />
    ),
    holdings: (
      <Stat
        label="Holdings"
        value={profile ? `${profile.bases.length} bases` : 'Unavailable'}
        hint="Owned and shared"
        href="/holdings"
      />
    ),
    fleet: (
      <Stat
        label="Fleet"
        value={profile ? `${profile.vehicles.length} vehicles` : 'Unavailable'}
        hint="Owned and shared"
        href="/vehicles"
      />
    ),
    population: (
      <Card
        as="section"
        data-portal-panel
        className="panel p-6 sm:p-8 xl:col-span-7 md:col-span-2"
        aria-labelledby="rhythm"
      >
        <h2 id="rhythm" className="text-lg">
          Server rhythm{' '}
          <span className="ml-2 font-mono text-xs font-normal tracking-widest text-sand-500">LAST 24 HOURS</span>
        </h2>
        <div className="mt-6">
          <PopulationChart history={world?.population} />
          {world?.population?.activity && <ActivityHeatmap points={world.population.activity} />}
        </div>
      </Card>
    ),
    landsraad: (
      <Card
        as="section"
        data-portal-panel
        className="panel p-6 sm:p-8 xl:col-span-5 md:col-span-2"
        aria-labelledby="landsraad"
      >
        <h2 id="landsraad" className="text-lg">
          Landsraad{' '}
          {council ? (
            <span className="font-mono text-xs font-normal tracking-widest text-sand-500">TERM {council.term}</span>
          ) : null}
        </h2>
        {council ? (
          <>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
              {(
                [
                  ['Atreides', council.atreides, council.atreides > council.harkonnen, '/maps/atreides.webp'],
                  ['Harkonnen', council.harkonnen, council.harkonnen > council.atreides, '/maps/harkonnen.webp'],
                ] as const
              ).flatMap(([name, score, leading, crest], index) => {
                const cell = (
                  <div key={name} className={leading ? 'text-spice-400' : 'text-sand-300'}>
                    <Image
                      src={crest}
                      alt={`House ${name} crest`}
                      width={56}
                      height={56}
                      unoptimized
                      className="mx-auto"
                    />
                    <strong className="mt-2 block text-2xl">{formatNumber(score, 0)}</strong>
                    <span className="text-xs font-bold uppercase tracking-[0.14em]">{name}</span>
                  </div>
                );
                return index === 0
                  ? [
                      cell,
                      <span key="vs" className="font-mono text-xs uppercase text-sand-600">
                        vs
                      </span>,
                    ]
                  : [cell];
              })}
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-widest text-sand-500">
              {council.decided}/{council.total} houses decided · Term ends in{' '}
              <b className="text-spice-400">{timeRemaining(council.endsAt, now)}</b>
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-sand-500">The current Landsraad term is not available.</p>
        )}
      </Card>
    ),
  };
}
