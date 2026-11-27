'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui/button';
import { buttonClass } from '../../../components/ui/control-styles';
import { StatePanel } from '../../../components/ui/state-panel';
import { useSharedReading } from '../../../lib/ui/use-shared-reading';
import { difficultyLabel, dungeonName, formatDuration } from '../../dungeons/model';
import { compactSolaris, formatSolaris } from '../../solaris/model';
import {
  groupDigits,
  plural,
  projectLabel,
  shortDate,
  type PersonalRecap,
  type PersonalResponse,
  type ServerRecap,
  type ServerResponse,
} from '../model';
import styles from './unwrapped.module.css';

type Tone = 'dawn' | 'dune' | 'night' | 'ember' | 'oasis';
type Slide = { id: string; label: string; tone: Tone; body: ReactNode };
type Deck = 'server' | 'personal';

const REFRESH_MS = 10 * 60_000;
const SWIPE_PX = 48;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
const parseServer = (body: unknown): ServerResponse | null =>
  isObject(body) && body.ok === true && isObject(body.recap) && typeof body.recap.year === 'number'
    ? (body as ServerResponse)
    : null;
const parsePersonal = (body: unknown): PersonalResponse | null =>
  isObject(body) && body.ok === true && isObject(body.recap) && typeof body.recap.linked === 'boolean'
    ? (body as PersonalResponse)
    : null;

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.2em] text-sand-200">{children}</p>;
}
function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-xs leading-relaxed text-sand-300">{children}</p>;
}
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.chip}>
      <p className="text-2xl font-bold text-sand-50">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-wider text-sand-300">{label}</p>
    </div>
  );
}

function serverSlides(recap: ServerRecap, onPersonal: () => void): Slide[] {
  const slides: Slide[] = [];
  const { year, releases, dungeons, solaris, roadmap } = recap;
  const any = Boolean(releases || dungeons || solaris || roadmap);
  slides.push({
    id: 'intro',
    label: `Arrakis Control ${year}`,
    tone: 'dawn',
    body: (
      <>
        <Eyebrow>Arrakis Control Unwrapped</Eyebrow>
        <p className={styles.big}>{year}</p>
        <p className="max-w-md text-lg text-sand-100">
          {any
            ? 'A look back at what this server built, ran and earned this year.'
            : 'The year is just getting started here. Check back once there is more to look back on.'}
        </p>
      </>
    ),
  });

  if (releases) {
    slides.push({
      id: 'releases',
      label: 'Releases shipped',
      tone: 'ember',
      body: (
        <>
          <Eyebrow>Shipped this year</Eyebrow>
          <p className={styles.big}>{releases.total}</p>
          <p className="text-xl text-sand-100">
            {releases.total === 1 ? 'release' : 'releases'} of the bot and dashboard
          </p>
          <div className={styles.chips}>
            <Chip label="New features" value={releases.features.toLocaleString()} />
            <Chip label="Improvements" value={releases.improvements.toLocaleString()} />
            <Chip label="Fixes" value={releases.fixes.toLocaleString()} />
          </div>
          <Note>
            {plural(releases.bot, 'bot release')} and {plural(releases.dashboard, 'dashboard release')}, from{' '}
            {projectLabel(releases.first.project)} v{releases.first.version} on {shortDate(releases.first.date)} to{' '}
            {projectLabel(releases.latest.project)} v{releases.latest.version} on {shortDate(releases.latest.date)}.
          </Note>
        </>
      ),
    });
    if (releases.biggest.highlights.length)
      slides.push({
        id: 'biggest-release',
        label: 'Biggest release',
        tone: 'dune',
        body: (
          <>
            <Eyebrow>Biggest release</Eyebrow>
            <p className={styles.medium}>
              {projectLabel(releases.biggest.project)} v{releases.biggest.version}
            </p>
            <p className="text-sand-200">
              {shortDate(releases.biggest.date)} · {plural(releases.biggest.features, 'new feature')}
            </p>
            <ol className="grid gap-2 text-lg text-sand-50">
              {releases.biggest.highlights.map((highlight, index) => (
                <li key={highlight} className="flex gap-3">
                  <span className="font-mono text-spice-300">{index + 1}</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ol>
            <Link href="/changelog" className="text-sm text-spice-200 underline underline-offset-4">
              Read the full release notes
            </Link>
          </>
        ),
      });
  }

  if (dungeons) {
    slides.push({
      id: 'dungeons',
      label: 'Dungeons',
      tone: 'night',
      body: (
        <>
          <Eyebrow>Into the depths</Eyebrow>
          <p className={styles.big}>{dungeons.totalRuns.toLocaleString()}</p>
          <p className="text-xl text-sand-100">dungeon {dungeons.totalRuns === 1 ? 'run' : 'runs'} on the board</p>
          <div className={styles.chips}>
            <Chip label="Dungeons" value={dungeons.dungeons.toLocaleString()} />
            <Chip label="Records" value={dungeons.records.toLocaleString()} />
            {dungeons.busiest && <Chip label="Most runs" value={dungeons.busiest.runCount.toLocaleString()} />}
          </div>
          {dungeons.busiest && (
            <p className="text-sand-100">
              Most run: <strong>{dungeonName(dungeons.busiest.dungeonId)}</strong> (
              {difficultyLabel(dungeons.busiest.difficulty)})
            </p>
          )}
          <Note>All-time counts: the game server does not record when a run happened.</Note>
        </>
      ),
    });
    if (dungeons.fastest)
      slides.push({
        id: 'fastest',
        label: 'Fastest clear',
        tone: 'ember',
        body: (
          <>
            <Eyebrow>Fastest clear on the server</Eyebrow>
            <p className={`${styles.big} font-mono`}>{formatDuration(dungeons.fastest.durationMs)}</p>
            <p className="text-xl text-sand-100">
              {dungeonName(dungeons.fastest.dungeonId)} · {difficultyLabel(dungeons.fastest.difficulty)}
            </p>
            {dungeons.fastest.party.length > 0 && (
              <p className="text-sand-200">by {dungeons.fastest.party.join(', ')}</p>
            )}
            {dungeons.holders.length > 0 && (
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-sand-300">Most records held</p>
                <ol className="grid gap-1.5 text-sand-50">
                  {dungeons.holders.map((holder, index) => (
                    <li key={holder.name} className="flex justify-between gap-4">
                      <span>
                        <span className="mr-3 font-mono text-spice-300">{index + 1}</span>
                        {holder.name}
                      </span>
                      <span className="font-mono text-sand-200">{plural(holder.records, 'record')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ),
      });
  }

  if (solaris)
    slides.push({
      id: 'solaris',
      label: 'Solaris',
      tone: 'dawn',
      body: (
        <>
          <Eyebrow>The spice must flow</Eyebrow>
          <p className={styles.big} title={`${formatSolaris(solaris.total)} Solaris`}>
            {compactSolaris(solaris.total)}
          </p>
          <p className="text-xl text-sand-100">Solaris held across {plural(solaris.ranked, 'character')}</p>
          {solaris.top && (
            <p className="text-sand-100">
              Wealthiest: <strong>{solaris.top.name ?? 'Unknown character'}</strong> with{' '}
              {formatSolaris(solaris.top.balance)} Solaris
            </p>
          )}
          {solaris.topTenShare !== null && (
            <p className="text-sand-200">The top ten hold {solaris.topTenShare}% of it.</p>
          )}
          <Note>Balances as they are right now, not earnings over the year.</Note>
        </>
      ),
    });

  if (roadmap)
    slides.push({
      id: 'roadmap',
      label: 'Roadmap',
      tone: 'oasis',
      body: (
        <>
          <Eyebrow>From the roadmap</Eyebrow>
          <p className={styles.big}>{roadmap.released.toLocaleString()}</p>
          <p className="text-xl text-sand-100">roadmap {roadmap.released === 1 ? 'item' : 'items'} released</p>
          <div className={styles.chips}>
            <Chip label="In the works" value={roadmap.inProgress.toLocaleString()} />
            <Chip label="Planned" value={roadmap.planned.toLocaleString()} />
          </div>
          <Link href="/roadmap" className="text-sm text-spice-200 underline underline-offset-4">
            See what is coming next
          </Link>
        </>
      ),
    });

  slides.push({
    id: 'outro',
    label: 'Thanks',
    tone: 'dune',
    body: (
      <>
        <Eyebrow>That was {year}</Eyebrow>
        <p className={styles.medium}>Thanks for playing, building and testing with us.</p>
        <div>
          <Button type="button" variant="primary" onClick={onPersonal}>
            See your own year
          </Button>
        </div>
      </>
    ),
  });
  return slides;
}

function personalSlides(recap: PersonalRecap): Slide[] {
  const { year } = recap;
  if (!recap.linked)
    return [
      {
        id: 'unlinked',
        label: 'Link a character',
        tone: 'night',
        body: (
          <>
            <Eyebrow>Your {year}</Eyebrow>
            <p className={styles.medium}>Link a character to unlock your year.</p>
            <p className="max-w-md text-sand-100">
              Your dungeon records, Solaris rank and progress all come from your linked character.
            </p>
            <div>
              <Link href="/character" className={buttonClass({ variant: 'primary' })}>
                Go to Character
              </Link>
            </div>
          </>
        ),
      },
    ];

  const slides: Slide[] = [
    {
      id: 'intro',
      label: `Your ${year}`,
      tone: 'dawn',
      body: (
        <>
          <Eyebrow>Your Unwrapped</Eyebrow>
          <p className={styles.big}>{year}</p>
          <p className="max-w-md text-lg text-sand-100">
            {recap.character ? `${recap.character}, here` : 'Here'} is your year on Arrakis.
          </p>
        </>
      ),
    },
  ];
  const { dungeons, solaris, journey } = recap;

  if (dungeons)
    slides.push({
      id: 'dungeons',
      label: 'Your dungeons',
      tone: 'night',
      body: (
        <>
          <Eyebrow>Your dungeon records</Eyebrow>
          <p className={styles.big}>{dungeons.records.toLocaleString()}</p>
          <p className="text-xl text-sand-100">
            personal {dungeons.records === 1 ? 'best' : 'bests'} across {plural(dungeons.dungeons, 'dungeon')}
          </p>
          {dungeons.serverRecords > 0 && (
            <p className="text-lg text-spice-200">
              You hold {dungeons.serverRecords === 1 ? 'a server record' : `${dungeons.serverRecords} server records`}.
            </p>
          )}
          {dungeons.fastest && (
            <p className="text-sand-100">
              Fastest clear: <strong className="font-mono">{formatDuration(dungeons.fastest.durationMs)}</strong> in{' '}
              {dungeonName(dungeons.fastest.dungeonId)} ({difficultyLabel(dungeons.fastest.difficulty)})
            </p>
          )}
        </>
      ),
    });

  if (solaris)
    slides.push({
      id: 'solaris',
      label: 'Your Solaris',
      tone: 'ember',
      body: (
        <>
          <Eyebrow>Your Solaris rank</Eyebrow>
          <p className={styles.big}>#{solaris.rank.toLocaleString()}</p>
          <p className="text-xl text-sand-100">of {plural(solaris.of, 'character')} on the server</p>
          <p className="text-sand-100">
            You hold <strong className="font-mono">{formatSolaris(solaris.balance)}</strong> Solaris.
          </p>
          <Note>Your balance right now, not earnings over the year.</Note>
        </>
      ),
    });

  if (journey) {
    const levelled = journey.levelFrom !== null && journey.levelTo !== null && journey.levelFrom !== journey.levelTo;
    slides.push({
      id: 'journey',
      label: 'Your progress',
      tone: 'oasis',
      body: (
        <>
          <Eyebrow>Your progress</Eyebrow>
          {levelled ? (
            <p className={styles.big}>
              {groupDigits(journey.levelFrom!)} → {groupDigits(journey.levelTo!)}
            </p>
          ) : (
            <p className={styles.medium}>
              {journey.levelTo !== null ? `Level ${groupDigits(journey.levelTo)}` : 'Still on the move'}
            </p>
          )}
          {levelled && <p className="text-xl text-sand-100">levels climbed</p>}
          <div className={styles.chips}>
            {journey.xpGained !== null && <Chip label="Experience gained" value={groupDigits(journey.xpGained)} />}
            {journey.journeySteps !== null && (
              <Chip label="Journey steps" value={journey.journeySteps.toLocaleString()} />
            )}
          </div>
          <Note>
            From your progression journal: {plural(journey.observations, 'observation')} between{' '}
            {shortDate(journey.from)} and {shortDate(journey.to)}. Nothing before your first observation is counted.
          </Note>
        </>
      ),
    });
  }

  if (!dungeons && !solaris && !journey)
    slides.push({
      id: 'quiet',
      label: 'A quiet year',
      tone: 'dune',
      body: (
        <>
          <Eyebrow>Your {year}</Eyebrow>
          <p className={styles.medium}>Not much on record for you yet.</p>
          <p className="max-w-md text-sand-100">Clear a dungeon or build up some Solaris and it will show up here.</p>
        </>
      ),
    });

  if (!journey && recap.tracking === false)
    slides.push({
      id: 'tracking',
      label: 'Track your progress',
      tone: 'night',
      body: (
        <>
          <Eyebrow>For next year</Eyebrow>
          <p className={styles.medium}>Want to see how far you came?</p>
          <p className="max-w-md text-sand-100">
            Start tracking in your progression journal and Unwrapped can show the levels and experience you gain.
          </p>
          <div>
            <Link href="/progression" className={buttonClass({ variant: 'secondary' })}>
              Open Progression
            </Link>
          </div>
        </>
      ),
    });

  slides.push({
    id: 'outro',
    label: 'See you next year',
    tone: 'dawn',
    body: (
      <>
        <Eyebrow>That was your {year}</Eyebrow>
        <p className={styles.medium}>See you out in the deep desert.</p>
      </>
    ),
  });
  return slides;
}

function Story({ slides, label }: { slides: Slide[]; label: string }) {
  const [index, setIndex] = useState(0);
  const start = useRef<number | null>(null);
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current]!;
  const go = useCallback((next: number) => setIndex(Math.min(Math.max(0, next), slides.length - 1)), [slides.length]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') go(current + 1);
    else if (event.key === 'ArrowLeft') go(current - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(slides.length - 1);
    else return;
    event.preventDefault();
  };
  const onPointerDown = (event: PointerEvent) => {
    start.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return;
    const dx = event.clientX - start.current;
    start.current = null;
    if (dx <= -SWIPE_PX) go(current + 1);
    else if (dx >= SWIPE_PX) go(current - 1);
  };

  return (
    <section aria-label={label} aria-roledescription="carousel" className="mx-auto max-w-xl">
      <div
        className={`${styles.stage} ${styles[slide.tone]}`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
      >
        <div className={styles.progress} aria-hidden="true">
          {slides.map((entry, position) => (
            <span
              key={entry.id}
              className={`${styles.segment} ${position < current ? styles.segmentDone : ''} ${position === current ? styles.segmentCurrent : ''}`}
            />
          ))}
        </div>
        <div
          key={`${label}:${slide.id}`}
          className={styles.slide}
          role="group"
          aria-roledescription="slide"
          aria-label={`${current + 1} of ${slides.length}: ${slide.label}`}
          aria-live="polite"
        >
          {slide.body}
        </div>
      </div>
      <nav aria-label={`${label} cards`} className="mt-4 flex items-center justify-between gap-3 text-sm text-sand-300">
        <Button type="button" variant="secondary" disabled={current === 0} onClick={() => go(current - 1)}>
          Previous
        </Button>
        <span>
          {current + 1} / {slides.length}
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={current === slides.length - 1}
          onClick={() => go(current + 1)}
        >
          Next
        </Button>
      </nav>
    </section>
  );
}

export function UnwrappedStory() {
  const [deck, setDeck] = useState<Deck>('server');
  const [personalOpened, setPersonalOpened] = useState(false);
  useEffect(() => {
    if (deck === 'personal') setPersonalOpened(true);
  }, [deck]);

  const server = useSharedReading('/api/v2/unwrapped?view=server', {
    initial: null,
    intervalMs: REFRESH_MS,
    parse: parseServer,
  });
  // The personal recap checks the member's linked character, so it is only asked for once they open it.
  const personal = useSharedReading(personalOpened ? '/api/v2/unwrapped?view=personal' : null, {
    initial: null,
    intervalMs: REFRESH_MS,
    parse: parsePersonal,
  });

  let content: ReactNode;
  if (deck === 'server') {
    content = server.data ? (
      <Story key="server" label="Server recap" slides={serverSlides(server.data.recap, () => setDeck('personal'))} />
    ) : server.loading ? (
      <StatePanel kind="loading" title="Unwrapping the year…" />
    ) : (
      <StatePanel kind="error" title="The server recap is unavailable" onRetry={server.retry}>
        Nothing is shown rather than guessed. Try again in a moment.
      </StatePanel>
    );
  } else {
    content = personal.data ? (
      <Story key="personal" label="Your recap" slides={personalSlides(personal.data.recap)} />
    ) : personal.loading || !personalOpened ? (
      <StatePanel kind="loading" title="Looking up your year…" />
    ) : (
      <StatePanel kind="error" title="Your recap is unavailable" onRetry={personal.retry}>
        Your linked character could not be checked right now. Try again in a moment.
      </StatePanel>
    );
  }

  return (
    <div>
      <div role="group" aria-label="Choose a recap" className="mb-5 flex justify-center gap-2">
        <Button
          type="button"
          variant={deck === 'server' ? 'primary' : 'secondary'}
          aria-pressed={deck === 'server'}
          onClick={() => setDeck('server')}
        >
          The server
        </Button>
        <Button
          type="button"
          variant={deck === 'personal' ? 'primary' : 'secondary'}
          aria-pressed={deck === 'personal'}
          onClick={() => setDeck('personal')}
        >
          You
        </Button>
      </div>
      {content}
    </div>
  );
}
