'use client';

import { useState } from 'react';
import { LocalTime } from '../../../components/ui/local-time';
import { BaseIcon } from '../../../components/icons';
import { EVENT_STATUS_LABELS, type CommunityEvent } from '../contracts';

export function CommunityEvents({ events }: { events: CommunityEvent[] }) {
  const [filter, setFilter] = useState('All events');
  const visible = events.filter(
    (event) =>
      filter === 'All events' ||
      (filter === 'Upcoming' && event.status === 'upcoming') ||
      (filter === 'Happening now' && ['open', 'judging'].includes(event.status)) ||
      (filter === 'Past events' && ['completed', 'cancelled'].includes(event.status)),
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border border-sand-200/10 bg-obsidian-900/40 p-4">
        <div role="group" aria-label="Filter community events" className="flex flex-wrap gap-2">
          {['All events', 'Upcoming', 'Happening now', 'Past events'].map((label) => (
            <button
              type="button"
              key={label}
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
              className={`min-h-10 border px-3 text-xs font-semibold ${filter === label ? 'border-spice-500/40 bg-spice-500/10 text-spice-300' : 'border-sand-200/10 text-sand-400 hover:text-sand-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p role="status" className="font-mono text-xs text-sand-500">
          {visible.length} {visible.length === 1 ? 'event' : 'events'}
        </p>
      </div>
      <div className="space-y-6">
        {visible.map((event) => (
          <article
            key={event.id}
            id={event.id}
            className={`panel overflow-hidden border-t-2 ${event.featured ? 'border-t-spice-500' : 'border-t-sand-500'}`}
            aria-label={event.title}
          >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0 p-5 sm:p-8">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  {event.featured && (
                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-spice-400">
                      Featured event
                    </span>
                  )}
                  <span
                    className={`border px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-wider ${event.status === 'open' ? 'border-status-ok/30 bg-status-ok/10 text-status-ok' : 'border-sand-200/15 text-sand-300'}`}
                  >
                    {EVENT_STATUS_LABELS[event.status]}
                  </span>
                </div>
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="hidden size-14 shrink-0 items-center justify-center border border-spice-500/25 bg-spice-500/10 text-spice-400 sm:flex"
                  >
                    <BaseIcon className="size-7" />
                  </span>
                  <div>
                    <h2 className="text-xl leading-tight sm:text-2xl">{event.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-400 [overflow-wrap:anywhere]">
                      {event.summary}
                    </p>
                  </div>
                </div>
                <div className="mt-6 border-t border-sand-200/10 pt-4 text-xs leading-relaxed text-sand-400">
                  {!event.startsAt && !event.endsAt ? (
                    <p>Schedule to be announced</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                      {event.startsAt && (
                        <p>
                          <span className="mr-2 text-sand-600">Starts</span>
                          <LocalTime value={event.startsAt} />
                        </p>
                      )}
                      {event.endsAt && (
                        <p>
                          <span className="mr-2 text-sand-600">Ends</span>
                          <LocalTime value={event.endsAt} />
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <aside
                aria-label="Event prizes"
                className="border-t border-spice-500/15 bg-spice-500/[0.05] p-5 sm:p-8 lg:border-l lg:border-t-0"
              >
                <p className="eyebrow text-spice-400">Prize pool</p>
                {event.prizeSolaris > 0 && (
                  <p className="mt-4">
                    <span className="block font-mono text-3xl font-bold tracking-tight text-sand-50">
                      {event.prizeSolaris.toLocaleString('en-US')}
                    </span>
                    <span className="mt-1 block text-xs font-bold uppercase tracking-[0.2em] text-spice-300">
                      Solaris coins
                    </span>
                  </p>
                )}
                {event.prizeItems && (
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-sand-300 [overflow-wrap:anywhere]">
                    {event.prizeItems}
                  </p>
                )}
                {!event.prizeSolaris && !event.prizeItems && (
                  <p className="mt-4 text-sm text-sand-400">Prizes to be announced.</p>
                )}
              </aside>
            </div>
            <details className="border-t border-sand-200/10">
              <summary className="cursor-pointer px-5 py-4 text-xs font-bold uppercase tracking-[0.12em] text-spice-300 focus-visible:outline-offset-[-3px] sm:px-8">
                Event details
              </summary>
              <div className="space-y-6 px-5 pb-6 sm:px-8 sm:pb-8">
                <p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-sand-300 [overflow-wrap:anywhere]">
                  {event.description}
                </p>
                <div className="grid gap-6 md:grid-cols-2">
                  <section>
                    <h3 className="text-sm">How to enter</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-sand-400 [overflow-wrap:anywhere]">
                      {event.participation || 'Entry details will be announced here.'}
                    </p>
                  </section>
                  <section>
                    <h3 className="text-sm">Rules & judging</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-sand-400 [overflow-wrap:anywhere]">
                      {event.rules || 'Competition rules and judging details will be announced here.'}
                    </p>
                  </section>
                </div>
              </div>
            </details>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="panel px-6 py-14 text-center">
          <h2 className="text-lg">More adventures ahead</h2>
          <p className="mt-3 text-sm text-sand-500">
            There are no events in this category yet. Check back for the next community announcement.
          </p>
        </div>
      )}
    </>
  );
}
