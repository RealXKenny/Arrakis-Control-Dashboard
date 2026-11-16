'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { overlapsLocalDay, type CalendarData, type CalendarItem } from '../model';

const categories = ['all', 'event', 'operation', 'maintenance'] as const;
const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function Item({ item }: { item: CalendarItem }) {
  return (
    <li className="border-l-2 border-spice-500/60 pl-3 text-sm">
      <a href={item.href} className="font-semibold text-spice-300 underline">
        {item.title}
      </a>{' '}
      <span className="text-sand-400">
        ({item.category}, {item.state})
      </span>
      <p>
        <LocalTime value={item.startsAt} />
        {item.endsAt && (
          <>
            {' '}
            – <LocalTime value={item.endsAt} />
          </>
        )}
      </p>
      {item.description && <p className="mt-1 whitespace-pre-wrap break-words text-sand-400">{item.description}</p>}
    </li>
  );
}

export function CommunityCalendar({ data }: { data: CalendarData }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('agenda');
  const [category, setCategory] = useState<(typeof categories)[number]>('all');
  useEffect(() => setCursor(Date.now()), []);
  const items = data.items.filter((item) => category === 'all' || item.category === category);
  if (cursor === null) return <p className="text-sm text-sand-400">Preparing your local-time calendar…</p>;
  const current = new Date(cursor);
  const start =
    view === 'month'
      ? new Date(current.getFullYear(), current.getMonth(), 1)
      : new Date(current.getFullYear(), current.getMonth(), current.getDate());
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  function move(direction: number) {
    const next = new Date(cursor);
    if (view === 'month') {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    } else next.setDate(next.getDate() + direction * 7);
    setCursor(next.getTime());
  }
  return (
    <>
      <div className="mb-5 space-y-2 text-sm text-sand-400" role="status">
        {!data.eventsAvailable && <p>Community events could not be loaded.</p>}
        {data.operationsState === 'unavailable' && (
          <p>Personal guild commitments could not be verified and are hidden.</p>
        )}
        {!data.maintenanceAvailable && <p>Maintenance information is unavailable.</p>}
        {data.unscheduledEvents > 0 && (
          <p>
            {data.unscheduledEvents} community event(s) have no reported start time and are not placed on the calendar.
          </p>
        )}
        <p>
          Dates and times use your device timezone. The maintenance source covers active queued restarts only; reload
          for changes.{' '}
          {data.maintenanceObservedAt && (
            <>
              Queue checked <LocalTime value={data.maintenanceObservedAt} />.
            </>
          )}
        </p>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Calendar controls">
        {(['agenda', 'week', 'month'] as const).map((name) => (
          <Button
            key={name}
            type="button"
            aria-pressed={view === name}
            onClick={() => setView(name)}
            className="min-h-11 border border-sand-200/20 px-4 capitalize aria-pressed:border-spice-500"
          >
            {name}
          </Button>
        ))}
        <label className="ml-2 text-sm">
          Category{' '}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="min-h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sand-100"
          >
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === 'agenda' ? (
        <Card as="section" className="panel p-5" aria-label="Agenda">
          {items.length ? (
            <ul className="space-y-5">
              {items.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p>No scheduled items are available in this view.</p>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-4">
            <Button
              type="button"
              onClick={() => move(-1)}
              className="min-h-11 border border-sand-200/20 px-4"
              aria-label={`Previous ${view}`}
            >
              Previous
            </Button>
            <h2 className="text-lg">
              {view === 'month'
                ? current.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                : `${days[0].toLocaleDateString()} – ${days[6].toLocaleDateString()}`}
            </h2>
            <Button
              type="button"
              onClick={() => move(1)}
              className="min-h-11 border border-sand-200/20 px-4"
              aria-label={`Next ${view}`}
            >
              Next
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {days.map((date) => {
              const dayItems = items.filter((item) => overlapsLocalDay(item, date));
              return (
                <Card
                  as="section"
                  key={key(date)}
                  className="panel p-4"
                  aria-label={date.toLocaleDateString(undefined, { dateStyle: 'full' })}
                >
                  <h3 className="font-semibold">
                    {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </h3>
                  {dayItems.length ? (
                    <ul className="mt-3 space-y-4">
                      {dayItems.map((item) => (
                        <Item key={item.id} item={item} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-sand-500">No scheduled items.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
