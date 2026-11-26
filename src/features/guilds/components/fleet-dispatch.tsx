'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import { fleetCandidatesSchema, fleetViewSchema, type FleetCandidates, type FleetView } from '../fleet';
import { operationLocalTime } from '../operations';
import { useLogistics } from './use-logistics';

const schema = fleetViewSchema.extend({ candidates: fleetCandidatesSchema.optional() });
const operationsSchema = z.object({
  operations: z.array(
    z.object({ id: z.uuid(), title: z.string(), startsAt: z.string(), endsAt: z.string(), status: z.string() }),
  ),
});

function BookingForm({
  view,
  guildId,
  busy,
  onSubmit,
  onCancel,
}: {
  view: FleetView;
  guildId: string;
  busy: boolean;
  onSubmit: (reservation: unknown) => void;
  onCancel: () => void;
}) {
  const bookable = view.vehicles.filter((vehicle) => view.canEdit || vehicle.isOwn);
  const [start] = useState(() => Date.now() + 3_600_000);
  const [vehicleId, setVehicleId] = useState(bookable[0]?.id ?? '');
  const [pilotRef, setPilotRef] = useState(view.pilots.find((pilot) => pilot.isSelf)?.ref ?? view.pilots[0]?.ref ?? '');
  const [purpose, setPurpose] = useState('');
  const [operationId, setOperationId] = useState('');
  const [startsAt, setStartsAt] = useState(operationLocalTime(new Date(start).toISOString()));
  const [endsAt, setEndsAt] = useState(operationLocalTime(new Date(start + 7_200_000).toISOString()));
  const [operations, setOperations] = useState<z.infer<typeof operationsSchema>['operations'] | null>(null);
  const [error, setError] = useState('');
  async function loadOperations() {
    try {
      const value = operationsSchema.parse(
        await guildRequest(`/api/v2/guilds/${encodeURIComponent(guildId)}/operations`),
      );
      setOperations(
        value.operations.filter((entry) => entry.status === 'scheduled' && Date.parse(entry.endsAt) > Date.now()),
      );
    } catch {
      setError('Operations could not be loaded. You can still book without linking one.');
      setOperations([]);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const from = new Date(startsAt);
    const to = new Date(endsAt);
    if (
      !vehicleId ||
      !pilotRef ||
      !purpose.trim() ||
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime())
    ) {
      setError('Choose a vehicle, pilot, purpose and valid times.');
      return;
    }
    setError('');
    onSubmit({
      id: crypto.randomUUID(),
      vehicleId,
      operationId: operationId || null,
      purpose: purpose.trim(),
      startsAt: from.toISOString(),
      endsAt: to.toISOString(),
      pilotRef,
    });
  }
  return (
    <form aria-label="Fleet booking" onSubmit={submit} className="grid min-w-0 gap-3 border border-sand-200/20 p-4">
      <FormMessage error={error} />
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Vehicle">
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className={inputClass}>
            {bookable.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} · {vehicle.type} · {vehicle.ownerName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pilot">
          <select value={pilotRef} onChange={(event) => setPilotRef(event.target.value)} className={inputClass}>
            {view.pilots.map((pilot) => (
              <option key={pilot.ref} value={pilot.ref}>
                {pilot.name}
                {pilot.isSelf ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Booking purpose">
          <input
            required
            maxLength={100}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Linked operation">
          <select
            value={operationId}
            onFocus={() => (operations ? undefined : void loadOperations())}
            onChange={(event) => {
              setOperationId(event.target.value);
              const linked = operations?.find((entry) => entry.id === event.target.value);
              if (linked) {
                setStartsAt(operationLocalTime(linked.startsAt));
                setEndsAt(operationLocalTime(linked.endsAt));
                if (!purpose.trim()) setPurpose(linked.title.slice(0, 100));
              }
            }}
            className={inputClass}
          >
            <option value="">No linked operation</option>
            {operations?.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Booked from">
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
        <Field label="Booked until">
          <input
            type="datetime-local"
            required
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
      </div>
      <p className="text-xs text-sand-400">
        Bookings last up to 48 hours and start within 60 days. A vehicle and a pilot can each hold one booking at a
        time. Booking does not move or lock the vehicle in game.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Book vehicle
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PublishForm({
  candidates,
  busy,
  onPublish,
  onCancel,
}: {
  candidates: FleetCandidates;
  busy: boolean;
  onPublish: (vehicleRef: string, notes: string) => void;
  onCancel: () => void;
}) {
  const available = candidates.vehicles.filter((vehicle) => !vehicle.published);
  const [vehicleRef, setVehicleRef] = useState(available[0]?.vehicleRef ?? '');
  const [notes, setNotes] = useState('');
  if (candidates.status !== 'ok')
    return (
      <p role="status" className="text-sm text-sand-400">
        {candidates.status === 'unlinked'
          ? 'Link your character to publish a vehicle.'
          : candidates.status === 'limited'
            ? 'Too many reads right now. Try again shortly.'
            : (candidates.message ?? 'Your vehicles could not be read right now.')}
      </p>
    );
  if (!available.length)
    return (
      <p className="text-sm text-sand-400">
        Your linked character reports no owned vehicles that are not already published.
      </p>
    );
  return (
    <form
      aria-label="Publish vehicle"
      className="grid min-w-0 gap-3 border border-sand-200/20 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onPublish(vehicleRef, notes);
      }}
    >
      <Field label="Owned vehicle">
        <select value={vehicleRef} onChange={(event) => setVehicleRef(event.target.value)} className={inputClass}>
          {available.map((vehicle) => (
            <option key={vehicle.vehicleRef} value={vehicle.vehicleRef}>
              {vehicle.name} · {vehicle.type}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fleet notes">
        <input
          maxLength={200}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-sand-400">
        Ownership is checked against your linked character when you publish. Members see the name, type and the
        condition, fuel and storage readings from that check.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="btn btn-primary" disabled={busy || !vehicleRef}>
          Publish to guild fleet
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** N065 fleet dispatch reservations for owner-published vehicles. */
export function FleetDispatch({ guildId }: { guildId: string }) {
  const [query, setQuery] = useState('');
  const state = useLogistics(guildId, 'fleet', schema, query);
  const [mode, setMode] = useState<'publish' | 'book' | null>(null);
  const [now] = useState(() => Date.now());
  const view = state.data;
  const run = async (input: Record<string, unknown>, message: string) => {
    if (await state.run({ ...input, revision: view?.revision ?? null }, message)) setMode(null);
  };
  const vehicleName = (id: string) => view?.vehicles.find((vehicle) => vehicle.id === id)?.name ?? 'Vehicle';
  return (
    <section aria-label="Fleet dispatch">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base">Fleet dispatch</h3>
          <p className="mt-1 max-w-prose text-sm text-sand-400">
            Owners publish vehicles their linked character owns. Owners and leaders book them for operations with an
            assigned pilot; overlapping bookings for a vehicle or pilot are refused.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={state.loading || state.saving}
            onClick={() => {
              setMode('publish');
              setQuery('&candidates=1');
            }}
          >
            Publish a vehicle
          </Button>
          {view && view.vehicles.some((vehicle) => view.canEdit || vehicle.isOwn) && (
            <Button type="button" className="btn btn-primary" disabled={state.saving} onClick={() => setMode('book')}>
              New booking
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3">
        <FormMessage error={state.error} status={state.status} />
      </div>
      {state.loading && (
        <p role="status" className="mt-3 text-sm text-sand-400">
          Loading fleet…
        </p>
      )}
      {view && mode === 'publish' && view.candidates && (
        <div className="mt-4">
          <PublishForm
            candidates={view.candidates}
            busy={state.saving}
            onCancel={() => setMode(null)}
            onPublish={(vehicleRef, notes) =>
              run({ action: 'publish', vehicleRef, notes }, 'Vehicle published to the guild fleet.')
            }
          />
        </div>
      )}
      {view && mode === 'book' && (
        <div className="mt-4">
          <BookingForm
            view={view}
            guildId={guildId}
            busy={state.saving}
            onCancel={() => setMode(null)}
            onSubmit={(reservation) => run({ action: 'reserve', reservation }, 'Booking saved.')}
          />
        </div>
      )}
      {view && (
        <>
          <h4 className="mt-6 text-sm text-sand-100">Published vehicles ({view.vehicles.length})</h4>
          {!view.vehicles.length && <p className="mt-2 text-sm text-sand-400">No vehicles published yet.</p>}
          <ul aria-label="Fleet vehicles" className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {view.vehicles.map((vehicle) => (
              <li key={vehicle.id} className="min-w-0 border border-sand-200/15 p-3 text-sm">
                <p className="break-words text-sand-100">
                  {vehicle.name} · {vehicle.type}
                </p>
                <p className="break-words text-xs text-sand-400">Owner: {vehicle.ownerName}</p>
                <p className="mt-1 text-xs text-sand-300">
                  Condition {vehicle.condition === null ? 'not reported' : `${Math.round(vehicle.condition)}%`} · Fuel{' '}
                  {vehicle.fuelPercent === null ? 'not reported' : `${Math.round(vehicle.fuelPercent)}%`}
                  {vehicle.storage
                    ? ` · Storage ${vehicle.storage.used ?? '?'} / ${vehicle.storage.max ?? '?'} ${vehicle.storage.unit}`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-sand-500">
                  Readings from <LocalTime value={vehicle.observedAt} />; they may have changed since.
                </p>
                {vehicle.notes && <p className="mt-1 break-words text-xs text-sand-300">{vehicle.notes}</p>}
                {(vehicle.isOwn || view.canEdit) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {vehicle.isOwn && (
                      <Button
                        type="button"
                        className="btn btn-secondary"
                        disabled={state.saving}
                        onClick={() =>
                          run({ action: 'reverify', vehicleId: vehicle.id }, 'Vehicle readings refreshed.')
                        }
                      >
                        Refresh readings
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.saving}
                      onClick={() =>
                        run(
                          { action: 'withdraw', vehicleId: vehicle.id },
                          'Vehicle withdrawn and its bookings cancelled.',
                        )
                      }
                    >
                      Withdraw {vehicle.name}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <h4 className="mt-6 text-sm text-sand-100">Bookings</h4>
          {!view.reservations.length && <p className="mt-2 text-sm text-sand-400">No bookings.</p>}
          <ul aria-label="Fleet bookings" className="mt-2 grid gap-2">
            {view.reservations.map((reservation) => (
              <li key={reservation.id} className="min-w-0 border border-sand-200/10 p-3 text-sm text-sand-300">
                <p className="break-words text-sand-100">
                  {vehicleName(reservation.vehicleId)} · {reservation.purpose}
                  {Date.parse(reservation.endsAt) <= now ? ' · Finished' : ''}
                </p>
                <p className="text-xs">
                  <LocalTime value={reservation.startsAt} /> — <LocalTime value={reservation.endsAt} />
                </p>
                <p className="break-words text-xs text-sand-400">
                  Pilot: {reservation.pilotName}
                  {reservation.isPilotSelf ? ' (you)' : ''} · booked by {reservation.bookedByName}
                </p>
                {reservation.canCancel && (
                  <Button
                    type="button"
                    className="btn btn-secondary mt-2"
                    disabled={state.saving}
                    onClick={() => run({ action: 'cancel', reservationId: reservation.id }, 'Booking cancelled.')}
                  >
                    Cancel booking
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
