import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon } from '../../../components/icons';
import { SIGN_IN_HREF } from '../../../components/navigation/nav-config';
import { currentSession } from '../../auth/server/session';
import { CAPABILITIES, FEATURED, FINAL, HERO, OPERATOR, PILLARS, type Featured } from '../content';
import { DashboardIllustration, GuildIllustration, MapIllustration } from './illustrations';

const SHELL = 'mx-auto w-full max-w-shell px-4 sm:px-6';

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-sand-300">
      <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 bg-spice-500" />
      <span>{children}</span>
    </li>
  );
}

const ILLUSTRATION = { map: MapIllustration, guilds: GuildIllustration } as const;

function FeatureRow({ feature, flip }: { feature: Featured; flip: boolean }) {
  const Icon = feature.icon;
  const Illustration = ILLUSTRATION[feature.id];
  return (
    <article
      aria-labelledby={`feature-${feature.id}`}
      className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-14"
    >
      <div className={`lg:col-span-5 ${flip ? 'lg:order-2' : ''}`}>
        <div className="flex items-center gap-3">
          <Icon className="size-6 text-spice-400" />
          <Eyebrow>{feature.eyebrow}</Eyebrow>
        </div>
        <h3 id={`feature-${feature.id}`} className="mt-4 text-xl leading-snug sm:text-2xl">
          {feature.title}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-sand-300">{feature.summary}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {feature.points.map((point) => (
            <Bullet key={point}>{point}</Bullet>
          ))}
        </ul>
        <Link href={feature.href} className="btn btn-ghost mt-8 w-full whitespace-normal py-3 text-center sm:w-auto">
          {feature.linkLabel}
          <ArrowRightIcon className="size-4 shrink-0" />
        </Link>
      </div>
      <div className={`min-w-0 lg:col-span-7 ${flip ? 'lg:order-1' : ''}`}>
        <Illustration />
      </div>
    </article>
  );
}

export default async function LandingPage() {
  // Only "is there a session" decides the call to action; nothing about the member reaches this public page.
  const signedIn = Boolean(await currentSession().catch(() => null));
  const primaryHref = signedIn ? '/portal' : SIGN_IN_HREF;
  const primaryLabel = signedIn ? 'Open dashboard' : 'Sign in with Discord';
  const final = signedIn ? FINAL.signedIn : FINAL.signedOut;

  return (
    <>
      {/* HERO */}
      <section aria-labelledby="landing-title" className="relative isolate overflow-hidden border-b border-sand-200/10">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-grid bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-horizon" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-noise opacity-[0.035] mix-blend-screen" />
        {/* A low sun: two flat rings, no glow. */}
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 -z-10 size-[26rem] rounded-full border border-spice-500/15 lg:-right-10 lg:top-8"
        />
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-12 -z-10 size-[18rem] rounded-full border border-spice-500/10 lg:right-14 lg:top-20"
        />

        <div
          className={`${SHELL} grid grid-cols-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-28`}
        >
          <div className="min-w-0 lg:col-span-6">
            <div className="motion-safe:animate-rise">
              <Eyebrow>{HERO.eyebrow}</Eyebrow>
            </div>
            <h1
              id="landing-title"
              className="mt-5 text-5xl leading-[1.02] sm:text-6xl lg:text-7xl motion-safe:animate-rise"
              style={{ animationDelay: '60ms' }}
            >
              <span className="block">{HERO.headline[0]}</span>{' '}
              <span className="block text-spice-500">{HERO.headline[1]}</span>
            </h1>
            <p
              className="mt-7 max-w-xl text-lg leading-relaxed text-sand-100 sm:text-xl motion-safe:animate-rise"
              style={{ animationDelay: '120ms' }}
            >
              {HERO.lead}
            </p>
            <p
              className="mt-4 max-w-xl text-base leading-relaxed text-sand-300 motion-safe:animate-rise"
              style={{ animationDelay: '170ms' }}
            >
              {signedIn ? HERO.body.replace('Sign in with Discord to', 'Use your dashboard to') : HERO.body}
            </p>
            <div
              className="mt-9 flex flex-col gap-4 sm:flex-row motion-safe:animate-rise"
              style={{ animationDelay: '220ms' }}
            >
              <Link href={primaryHref} prefetch={false} className="btn btn-primary">
                {primaryLabel}
                <ArrowRightIcon className="size-4" />
              </Link>
              <a href="#features" className="btn btn-ghost">
                Explore features
              </a>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-6 motion-safe:animate-rise" style={{ animationDelay: '260ms' }}>
            <DashboardIllustration />
          </div>
        </div>
      </section>

      {/* OVERVIEW */}
      <section aria-labelledby="overview-title" className={`${SHELL} py-16 sm:py-20`}>
        <Eyebrow>Overview</Eyebrow>
        <h2 id="overview-title" className="mt-4 max-w-3xl text-2xl leading-snug sm:text-3xl">
          One dashboard for players, communities and operators
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-px border border-sand-200/10 bg-sand-200/10 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="bg-obsidian-950 p-6 sm:p-8">
              <h3 className="text-sm tracking-monolith text-spice-400">{pillar.title}</h3>
              <p className="mt-4 text-base leading-relaxed text-sand-300">{pillar.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED CAPABILITIES */}
      <section
        id="features"
        aria-labelledby="features-title"
        className="border-y border-sand-200/10 bg-obsidian-900 py-16 sm:py-24"
      >
        <div className={SHELL}>
          <Eyebrow>Features</Eyebrow>
          <h2 id="features-title" className="mt-4 max-w-3xl text-2xl leading-snug sm:text-3xl">
            What you can do with it
          </h2>
          <div className="mt-12 flex flex-col gap-16 sm:mt-16 sm:gap-24">
            {FEATURED.map((feature, index) => (
              <FeatureRow key={feature.id} feature={feature} flip={index % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      {/* MORE CAPABILITIES */}
      <section aria-labelledby="more-title" className={`${SHELL} py-16 sm:py-24`}>
        <Eyebrow>And around it</Eyebrow>
        <h2 id="more-title" className="mt-4 max-w-3xl text-2xl leading-snug sm:text-3xl">
          More of the world, in one place
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            return (
              <li key={capability.id} className="flex">
                <article className="panel panel-interactive relative flex w-full flex-col gap-4 p-6 focus-within:border-spice-400">
                  <Icon className="size-7 text-spice-400" />
                  <h3 className="text-base leading-snug tracking-monolith">
                    <Link
                      href={capability.href}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {capability.title}
                    </Link>
                  </h3>
                  <p className="text-sm leading-relaxed text-sand-300">{capability.summary}</p>
                  {capability.note && (
                    <p className="mt-auto border-t border-sand-200/10 pt-4 font-mono text-[0.6875rem] uppercase leading-snug tracking-widest text-ibad-300">
                      {capability.note}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* OPERATORS */}
      <section aria-labelledby="operators-title" className="border-y border-sand-200/10 bg-obsidian-900 py-16 sm:py-24">
        <div className={`${SHELL} grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14`}>
          <div className="lg:col-span-5">
            <Eyebrow>{OPERATOR.eyebrow}</Eyebrow>
            <h2 id="operators-title" className="mt-4 text-2xl leading-snug sm:text-3xl">
              {OPERATOR.title}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-sand-300">{OPERATOR.summary}</p>
          </div>
          <ul className="panel flex flex-col gap-4 p-6 sm:p-8 lg:col-span-7">
            {OPERATOR.points.map((point) => (
              <Bullet key={point}>{point}</Bullet>
            ))}
          </ul>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section aria-labelledby="cta-title" className={`${SHELL} py-16 sm:py-24`}>
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <Eyebrow>{final.eyebrow}</Eyebrow>
            <h2 id="cta-title" className="mt-4 text-2xl leading-snug sm:text-3xl">
              {final.title}
            </h2>
            <p className="mt-3 max-w-lg text-base text-sand-300">{final.text}</p>
          </div>
          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">
            <Link href={primaryHref} prefetch={false} className="btn btn-primary shrink-0">
              {primaryLabel}
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link href="/changelog" className="btn btn-ghost shrink-0">
              Release notes
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
