'use client';
import { Button } from '../../../components/ui/button';

import { useMemo, useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { localTimeZone } from '../../../lib/time';
import {
  AVAILABILITY_WINDOW_LIMIT,
  availabilityBoard,
  availabilityDraftSchema,
  availabilityStale,
  availabilityViewSchema,
  bestStartTimes,
  type AvailabilityDraft,
} from '../availability';
import { weekdayLabels } from '../zoned-time';
import { useLogistics } from './use-logistics';

function OwnAvailability({
  initial,
  busy,
  onSave,
  onClear,
}: {
  initial: AvailabilityDraft | null;
  busy: boolean;
  onSave: (draft: AvailabilityDraft) => void;
  onClear: (() => void) | null;
}) {
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? localTimeZone());
  const [windows, setWindows] = useState(initial?.windows ?? [{ day: 6, start: '18:00', end: '22:00' }]);
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = availabilityDraftSchema.safeParse({ timeZone: timeZone.trim(), windows, note });
    if (!parsed.success) {
      setError(
        'Use a valid timezone (for example America/New_York) and 1–14 windows with different start and end times.',
      );
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form aria-label="My availability" onSubmit={submit} className="grid min-w-0 gap-3 border border-sand-200/20 p-4">
      <h4 className="text-sm text-sand-100">My usual availability</h4>
      <FormMessage error={error} />
      <Field label="My timezone" hint="Detected from this device; change it if you play elsewhere">
        <input
          maxLength={80}
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          className={inputClass}
        />
      </Field>
      {windows.map((window, index) => (
        <div key={index} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label={`Window ${index + 1} day`}>
            <select
              value={window.day}
              onChange={(event) =>
                setWindows(
                  windows.map((entry, i) => (i === index ? { ...entry, day: Number(event.target.value) } : entry)),
                )
              }
              className={inputClass}
            >
              {weekdayLabels.map((label, day) => (
                <option key={label} value={day}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Window ${index + 1} from`}>
            <input
              type="time"
              value={window.start}
              onChange={(event) =>
                setWindows(windows.map((entry, i) => (i === index ? { ...entry, start: event.target.value } : entry)))
              }
              className={inputClass}
            />
          </Field>
          <Field label={`Window ${index + 1} until`} hint="Earlier than the start means past midnight">
            <input
              type="time"
              value={window.end}
              onChange={(event) =>
                setWindows(windows.map((entry, i) => (i === index ? { ...entry, end: event.target.value } : entry)))
              }
              className={inputClass}
            />
          </Field>
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={windows.length <= 1}
            onClick={() => setWindows(windows.filter((_, i) => i !== index))}
          >
            Remove window {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        className="btn btn-secondary justify-self-start"
        disabled={windows.length >= AVAILABILITY_WINDOW_LIMIT}
        onClick={() => setWindows([...windows, { ...windows[windows.length - 1] }])}
      >
        Add window
      </Button>
      <Field label="Availability note">
        <input maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
      </Field>
      <p className="text-xs text-sand-400">
        Shared with current guild members. It is a planning aid, not a promise to attend.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Save my availability
        </Button>
        {onClear && (
          <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onClear}>
            Remove my availability
          </Button>
        )}
      </div>
    </form>
  );
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** N062 timezone-aware availability board, shown in the viewer's own timezone. */
export function AvailabilityBoard({ guildId }: { guildId: string }) {
  const state = useLogistics(guildId, 'availability', availabilityViewSchema);
  const [now] = useState(() => Date.now());
  const [length, setLength] = useState(2);
  const entries = useMemo(() => state.data?.entries ?? [], [state.data]);
  const own = entries.find((entry) => entry.isSelf) ?? null;
  const slots = useMemo(() => availabilityBoard(entries, now), [entries, now]);
  const best = useMemo(() => bestStartTimes(slots, length), [slots, length]);
  const max = Math.max(1, ...slots.map((slot) => slot.names.length));
  const days = useMemo(() => {
    const grouped = new Map<string, Array<(typeof slots)[number] | null>>();
    for (const slot of slots) {
      const date = new Date(slot.start);
      const key = dayFormat.format(date);
      if (!grouped.has(key))
        grouped.set(
          key,
          Array.from({ length: 24 }, () => null),
        );
      grouped.get(key)![date.getHours()] = slot;
    }
    return [...grouped.entries()];
  }, [slots]);
  return (
    <section aria-label="Availability board">
      <h3 className="text-base">Availability board</h3>
      <p className="mt-1 max-w-prose text-sm text-sand-400">
        Members share their usual weekly play windows in their own timezone. The board converts everything to your
        timezone ({localTimeZone()}) for the next seven days, including daylight-saving changes.
      </p>
      <div className="mt-3">
        <FormMessage error={state.error} status={state.status} />
      </div>
      {state.loading && (
        <p role="status" className="mt-3 text-sm text-sand-400">
          Loading availability…
        </p>
      )}
      {state.data && (
        <div className="mt-4 grid min-w-0 gap-6">
          <OwnAvailability
            key={own?.updatedAt ?? 'new'}
            initial={own}
            busy={state.saving}
            onSave={(availability) => state.run({ action: 'save', availability }, 'Your availability is saved.')}
            onClear={own ? () => state.run({ action: 'clear' }, 'Your availability is removed.') : null}
          />
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <h4 className="text-sm text-sand-100">Best start times</h4>
              <label className="flex items-center gap-2 text-xs text-sand-400">
                Run length
                <select
                  value={length}
                  onChange={(event) => setLength(Number(event.target.value))}
                  className={`${inputClass} w-auto`}
                >
                  {[1, 2, 3, 4].map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hour{hours === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {best.length ? (
              <ol aria-label="Suggested start times" className="mt-2 grid gap-2 text-sm text-sand-300">
                {best.map((option) => (
                  <li key={option.start} className="break-words">
                    <LocalTime value={option.start} /> · {option.available} available for all {length} hour
                    {length === 1 ? '' : 's'} ({option.names.join(', ')})
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-sand-400">No shared windows yet. Add yours to get suggestions.</p>
            )}
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-[0.6875rem]">
              <caption className="mb-2 text-left text-xs text-sand-400">
                Members available each hour, in your timezone. Hover or focus a cell for names.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="p-1 text-left font-normal text-sand-500">
                    Day
                  </th>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <th key={hour} scope="col" className="p-1 font-normal text-sand-500">
                      {String(hour).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(([day, hours]) => (
                  <tr key={day}>
                    <th scope="row" className="whitespace-nowrap p-1 text-left font-normal text-sand-300">
                      {day}
                    </th>
                    {hours.map((slot, hour) => (
                      <td
                        key={hour}
                        tabIndex={slot && slot.names.length ? 0 : undefined}
                        title={slot?.names.join(', ') || undefined}
                        aria-label={
                          slot
                            ? `${day} ${String(hour).padStart(2, '0')}:00, ${slot.names.length} available`
                            : undefined
                        }
                        className="border border-sand-200/10 p-1 text-center text-sand-100"
                        style={
                          slot && slot.names.length
                            ? {
                                background: `color-mix(in srgb, var(--color-spice-400) ${Math.round(
                                  15 + (slot.names.length / max) * 60,
                                )}%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {slot ? slot.names.length || '' : '·'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="text-sm text-sand-100">
              Shared by {entries.length} member{entries.length === 1 ? '' : 's'}
            </h4>
            <ul className="mt-2 grid gap-1 text-xs text-sand-300">
              {entries.map((entry) => (
                <li key={entry.id} className="break-words">
                  {entry.name}
                  {entry.isSelf ? ' (you)' : ''} · {entry.timeZone} · {entry.windows.length} window
                  {entry.windows.length === 1 ? '' : 's'}
                  {entry.note ? ` · ${entry.note}` : ''} · updated <LocalTime value={entry.updatedAt} variant="date" />
                  {availabilityStale(entry.updatedAt, now) ? ' · may be outdated' : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
