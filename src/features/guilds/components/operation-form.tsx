'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import {
  OPERATION_PREPARATION_LIMIT,
  OPERATION_WAYPOINT_LIMIT,
  operationDraftSchema,
  operationKinds,
  operationKindLabel,
  operationMapLabel,
  operationMaps,
  operationRoles,
  operationRoleLabel,
  operationLocalTime,
  waypointPurposeLabel,
  waypointPurposes,
  type OperationDraft,
  type OperationRole,
  type Waypoint,
} from '../operations';

type WaypointRow = Omit<Waypoint, 'sector' | 'x' | 'y'> & { sector: string; x: string; y: string };

function waypointRow(waypoint: Waypoint): WaypointRow {
  return {
    ...waypoint,
    sector: waypoint.sector ?? '',
    x: waypoint.x === null ? '' : String(waypoint.x),
    y: waypoint.y === null ? '' : String(waypoint.y),
  };
}

export function OperationForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: OperationDraft;
  busy: boolean;
  onSave: (draft: OperationDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [startsAt, setStartsAt] = useState(operationLocalTime(initial.startsAt));
  const [endsAt, setEndsAt] = useState(operationLocalTime(initial.endsAt));
  const [capacities, setCapacities] = useState(() =>
    Object.fromEntries(
      operationRoles.map((role) => [role, initial.roles.find((slot) => slot.role === role)?.capacity ?? 0]),
    ),
  );
  const [preparation, setPreparation] = useState(initial.preparation ?? []);
  const [briefings, setBriefings] = useState<Partial<Record<OperationRole, string>>>(initial.briefings ?? {});
  const [waypoints, setWaypoints] = useState<WaypointRow[]>((initial.waypoints ?? []).map(waypointRow));
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setError('Choose valid start and end times.');
      return;
    }
    const roles = operationRoles
      .filter((role) => capacities[role] > 0)
      .map((role) => ({ role, capacity: capacities[role] }));
    const number = (value: string) => (value.trim() === '' ? null : Number(value));
    const input = operationDraftSchema.safeParse({
      ...draft,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      roles,
      preparation: preparation.filter((entry) => entry.text.trim()),
      // Briefings for disabled roles are dropped so nobody receives instructions for a seat that no longer exists.
      briefings: Object.fromEntries(
        roles.flatMap(({ role }) => (briefings[role]?.trim() ? [[role, briefings[role]!.trim()]] : [])),
      ),
      waypoints: waypoints.map((entry) => ({
        ...entry,
        sector: entry.sector.trim().toUpperCase() || null,
        x: number(entry.x),
        y: number(entry.y),
      })),
    });
    if (!input.success) {
      setError(
        'Enter a title, meeting point, valid times (up to 24 hours) and 1–50 role slots. Each waypoint needs a label and a sector (A1–I9) or both world X and Y.',
      );
      return;
    }
    setError('');
    onSave(input.data);
  }
  return (
    <form
      aria-label="Guild operation"
      onSubmit={submit}
      className="mt-6 grid min-w-0 grid-cols-1 gap-4 border border-sand-200/20 p-4 sm:p-6"
    >
      <h3 className="text-sm">Plan an operation</h3>
      <FormMessage error={error} />
      <Field label="Operation title">
        <input
          required
          maxLength={100}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Operation type">
        <select
          value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as OperationDraft['kind'] })}
          className={inputClass}
        >
          {operationKinds.map((kind) => (
            <option key={kind} value={kind}>
              {operationKindLabel[kind]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Starts at">
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
        <Field label="Ends at">
          <input
            required
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
      </div>
      <p className="text-xs text-sand-400">
        Times use your device timezone. Choose a future start within one year; operations can last up to 24 hours.
      </p>
      <Field label="Meeting point">
        <input
          required
          maxLength={200}
          value={draft.meetingPoint}
          onChange={(event) => setDraft({ ...draft, meetingPoint: event.target.value })}
          placeholder="Guild base, map region, or rally point"
          className={inputClass}
        />
      </Field>
      <Field label="Operation details">
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.details}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          className={inputClass}
        />
      </Field>
      <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-bold text-sand-200">Role slots · up to 50 total</legend>
        {operationRoles.map((role) => (
          <Field key={role} label={`${operationRoleLabel[role]} slots`}>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              required
              value={capacities[role]}
              onChange={(event) => setCapacities({ ...capacities, [role]: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
        ))}
      </fieldset>
      <p className="text-xs text-sand-400">
        Zero disables a role. Editing keeps current sign-ups; tell members about changed times or meeting points.
        Occupied slots cannot be removed until members are reassigned or removed.
      </p>
      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-3 text-sm font-bold text-sand-200">
          Preparation list · up to {OPERATION_PREPARATION_LIMIT} items
        </legend>
        {preparation.map((item, index) => (
          <div key={item.id} className="flex min-w-0 flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label={`Preparation item ${index + 1}`}>
                <input
                  maxLength={200}
                  value={item.text}
                  onChange={(event) =>
                    setPreparation(
                      preparation.map((entry) =>
                        entry.id === item.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    )
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <Button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPreparation(preparation.filter((entry) => entry.id !== item.id))}
              aria-label={`Remove preparation item ${index + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          className="btn btn-secondary justify-self-start"
          disabled={preparation.length >= OPERATION_PREPARATION_LIMIT}
          onClick={() => setPreparation([...preparation, { id: crypto.randomUUID(), text: '' }])}
        >
          Add preparation item
        </Button>
        <p className="text-xs text-sand-400">
          Members tick these items when they share their readiness. Ticks are self-reported, not checked in game.
        </p>
      </fieldset>
      <fieldset className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <legend className="mb-3 text-sm font-bold text-sand-200">Role briefings</legend>
        {operationRoles
          .filter((role) => capacities[role] > 0)
          .map((role) => (
            <Field key={role} label={`${operationRoleLabel[role]} briefing`}>
              <textarea
                rows={3}
                maxLength={1000}
                value={briefings[role] ?? ''}
                onChange={(event) => setBriefings({ ...briefings, [role]: event.target.value })}
                className={inputClass}
              />
            </Field>
          ))}
        <p className="text-xs text-sand-400 md:col-span-2">
          Members see only the briefing for the role they hold or are invited to. Leaders see every briefing.
        </p>
      </fieldset>
      <fieldset className="grid min-w-0 gap-4">
        <legend className="mb-3 text-sm font-bold text-sand-200">
          Waypoints and rally points · up to {OPERATION_WAYPOINT_LIMIT}
        </legend>
        {waypoints.map((waypoint, index) => {
          const update = (patch: Partial<WaypointRow>) =>
            setWaypoints(waypoints.map((entry) => (entry.id === waypoint.id ? { ...entry, ...patch } : entry)));
          return (
            <div
              key={waypoint.id}
              className="grid min-w-0 grid-cols-1 gap-3 border border-sand-200/10 p-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <Field label={`Waypoint ${index + 1} label`}>
                <input
                  maxLength={80}
                  value={waypoint.label}
                  onChange={(event) => update({ label: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={`Waypoint ${index + 1} purpose`}>
                <select
                  value={waypoint.purpose}
                  onChange={(event) => update({ purpose: event.target.value as Waypoint['purpose'] })}
                  className={inputClass}
                >
                  {waypointPurposes.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {waypointPurposeLabel[purpose]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Waypoint ${index + 1} map`}>
                <select
                  value={waypoint.map}
                  onChange={(event) => update({ map: event.target.value as Waypoint['map'] })}
                  className={inputClass}
                >
                  {operationMaps.map((map) => (
                    <option key={map} value={map}>
                      {operationMapLabel[map]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Waypoint ${index + 1} sector`} hint="A1 to I9, optional">
                <input
                  maxLength={2}
                  value={waypoint.sector}
                  onChange={(event) => update({ sector: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={`Waypoint ${index + 1} world X`} hint="From the map's location details">
                <input
                  inputMode="numeric"
                  value={waypoint.x}
                  onChange={(event) => update({ x: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={`Waypoint ${index + 1} world Y`}>
                <input
                  inputMode="numeric"
                  value={waypoint.y}
                  onChange={(event) => update({ y: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label={`Waypoint ${index + 1} note`}>
                  <input
                    maxLength={200}
                    value={waypoint.note}
                    onChange={(event) => update({ note: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Button
                type="button"
                className="btn btn-secondary justify-self-start"
                onClick={() => setWaypoints(waypoints.filter((entry) => entry.id !== waypoint.id))}
              >
                Remove waypoint {index + 1}
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          className="btn btn-secondary justify-self-start"
          disabled={waypoints.length >= OPERATION_WAYPOINT_LIMIT}
          onClick={() =>
            setWaypoints([
              ...waypoints,
              {
                id: crypto.randomUUID(),
                label: '',
                purpose: 'rally',
                map: draft.kind === 'deep-desert' ? 'DeepDesert' : 'HaggaBasin',
                sector: '',
                x: '',
                y: '',
                note: '',
              },
            ])
          }
        >
          Add waypoint
        </Button>
        <p className="text-xs text-sand-400">
          Waypoints are private to guild members. Copy world X and Y from a marker&apos;s location details on the live
          map to pin the point; a sector alone is listed without a pin.
        </p>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving…' : 'Save operation'}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel} className="btn btn-secondary">
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
