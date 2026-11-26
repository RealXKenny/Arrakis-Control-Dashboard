'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import {
  OPERATION_CARGO_LIMIT,
  OPERATION_CONVOY_CREW_LIMIT,
  OPERATION_CONVOY_LIMIT,
  OPERATION_LESSON_LIMIT,
  OPERATION_SCREENSHOT_LIMIT,
  convoySchema,
  followUpStatusLabel,
  operationMapLabel,
  operationOpen,
  operationReviewable,
  operationRoleLabel,
  operationsViewSchema,
  readinessLabel,
  readinessStatuses,
  reportDraftSchema,
  reportOutcomeLabel,
  reportOutcomes,
  waypointMapHref,
  waypointPurposeLabel,
  type ConvoyVehicle,
  type OperationInput,
  type OperationRole,
  type OperationView,
} from '../operations';

type Props = {
  guildId: string;
  operation: OperationView;
  canEdit: boolean;
  now: number;
  busy: boolean;
  onChange: (input: OperationInput) => void;
  onReplace: (operation: OperationView) => void;
};
const target = (operation: OperationView) => ({ id: operation.id, revision: operation.revision });

/** N063 waitlist controls and invitations for one role slot. */
export function RoleWaitlist({
  operation,
  role,
  full,
  now,
  busy,
  onChange,
}: Pick<Props, 'operation' | 'now' | 'busy' | 'onChange'> & { role: OperationRole; full: boolean }) {
  const open = operationOpen(operation, now);
  const ownWait = operation.waitlist.find((entry) => entry.isSelf);
  const ownInvite = operation.invitations.find((entry) => entry.isSelf && entry.role === role);
  const own = operation.signups.find((entry) => entry.isSelf);
  const waiting = operation.waitlist.filter((entry) => entry.role === role).length;
  const invited = operation.invitations.filter((entry) => entry.role === role).length;
  return (
    <div className="mt-3 grid gap-2 text-xs text-sand-400">
      {(waiting > 0 || invited > 0) && (
        <p>
          {waiting} waiting{invited ? ` · ${invited} seat${invited === 1 ? '' : 's'} offered` : ''}
        </p>
      )}
      {ownInvite && open && Date.parse(ownInvite.expiresAt) > now && (
        <div className="border-l-2 border-spice-400 p-2 text-sand-200" role="status">
          <p>
            A {operationRoleLabel[role]} seat is held for you until <LocalTime value={ownInvite.expiresAt} />.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onChange({ action: 'invitation', ...target(operation), decision: 'accept' })}
            >
              Accept {operationRoleLabel[role]} seat
            </Button>
            <Button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => onChange({ action: 'invitation', ...target(operation), decision: 'decline' })}
            >
              Decline seat
            </Button>
          </div>
        </div>
      )}
      {ownWait?.role === role && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sand-200">Your waitlist place: {ownWait.position}</span>
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={!open || busy}
            onClick={() => onChange({ action: 'waitlist-leave', ...target(operation) })}
          >
            Leave waitlist
          </Button>
        </div>
      )}
      {full && open && !ownInvite && ownWait?.role !== role && own?.role !== role && (
        <Button
          type="button"
          className="btn btn-secondary justify-self-start"
          disabled={busy}
          onClick={() => onChange({ action: 'waitlist-join', ...target(operation), role })}
        >
          Join {operationRoleLabel[role]} waitlist
        </Button>
      )}
    </div>
  );
}

function Briefings({ operation, canEdit }: Pick<Props, 'operation' | 'canEdit'>) {
  const entries = Object.entries(operation.briefings ?? {}).filter(([, value]) => value) as Array<
    [OperationRole, string]
  >;
  if (!entries.length) return null;
  return (
    <section aria-label="Role briefings" className="mt-5 grid gap-3">
      <h4 className="text-sm text-sand-100">{canEdit ? 'Role briefings' : 'Your role briefing'}</h4>
      {entries.map(([role, value]) => (
        <div key={role} className="border-l-2 border-spice-400/60 pl-3">
          <p className="font-mono text-xs uppercase tracking-wider text-spice-300">{operationRoleLabel[role]}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-sand-300">{value}</p>
        </div>
      ))}
    </section>
  );
}

function Waypoints({ operation }: Pick<Props, 'operation'>) {
  if (!operation.waypoints?.length) return null;
  return (
    <section aria-label="Operation waypoints" className="mt-5">
      <h4 className="text-sm text-sand-100">Waypoints and rally points</h4>
      <ul className="mt-2 grid gap-2 text-sm">
        {operation.waypoints.map((waypoint) => (
          <li key={waypoint.id} className="min-w-0 break-words text-sand-300">
            <strong className="text-sand-100">{waypoint.label}</strong> · {waypointPurposeLabel[waypoint.purpose]} ·{' '}
            {operationMapLabel[waypoint.map]}
            {waypoint.sector ? ` · Sector ${waypoint.sector}` : ''}
            {waypoint.x !== null && waypoint.y !== null
              ? ` · X ${Math.round(waypoint.x)} Y ${Math.round(waypoint.y)}`
              : ''}
            {waypoint.note ? ` · ${waypoint.note}` : ''}{' '}
            <a className="text-spice-300 underline" href={waypointMapHref(waypoint)}>
              {waypoint.x !== null ? 'Show on map' : 'Open map'}
              <span className="sr-only"> for {waypoint.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** N064 readiness: self-reported kit status tied to this operation's preparation list. */
function Readiness({ operation, now, busy, onChange }: Pick<Props, 'operation' | 'now' | 'busy' | 'onChange'>) {
  const own = operation.signups.find((entry) => entry.isSelf);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(own?.readiness?.status ?? 'ready');
  const [checked, setChecked] = useState<string[]>(own?.readiness?.checked ?? []);
  const [note, setNote] = useState(own?.readiness?.note ?? '');
  const prep = operation.preparation ?? [];
  const active = operation.status !== 'cancelled' && Date.parse(operation.endsAt) > now;
  const shared = operation.signups.filter((entry) => entry.readiness);
  if (!prep.length && !own && !shared.length) return null;
  function submit(event: FormEvent) {
    event.preventDefault();
    onChange({ action: 'readiness', ...target(operation), readiness: { status, checked, note } });
    setEditing(false);
  }
  return (
    <section aria-label="Team readiness" className="mt-5">
      <h4 className="text-sm text-sand-100">Preparation and readiness</h4>
      {prep.length > 0 && (
        <ul aria-label="Preparation list" className="mt-2 list-disc pl-5 text-sm text-sand-300">
          {prep.map((item) => (
            <li key={item.id} className="break-words">
              {item.text}
            </li>
          ))}
        </ul>
      )}
      <ul aria-label="Readiness cards" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {operation.signups.map((signup) => (
          <li key={signup.id} className="min-w-0 border border-sand-200/10 p-2 text-xs">
            <p className="break-words text-sand-200">
              {signup.name} · {operationRoleLabel[signup.role]}
            </p>
            {signup.readiness ? (
              <>
                <p className="mt-1 text-spice-300">
                  {readinessLabel[signup.readiness.status]}
                  {prep.length ? ` · ${signup.readiness.checked.length}/${prep.length} items ticked` : ''}
                </p>
                {signup.readiness.note && <p className="mt-1 break-words text-sand-400">{signup.readiness.note}</p>}
                <p className="mt-1 text-sand-500">
                  Self-reported <LocalTime value={signup.readiness.updatedAt} />
                </p>
              </>
            ) : (
              <p className="mt-1 text-sand-500">Not shared</p>
            )}
          </li>
        ))}
      </ul>
      {own && active && !editing && (
        <Button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={() => setEditing(true)}>
          {own.readiness ? 'Update my readiness' : 'Share my readiness'}
        </Button>
      )}
      {own && active && editing && (
        <form aria-label="My readiness" onSubmit={submit} className="mt-3 grid gap-3 border border-sand-200/20 p-3">
          <Field label="Readiness">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className={inputClass}
            >
              {readinessStatuses.map((value) => (
                <option key={value} value={value}>
                  {readinessLabel[value]}
                </option>
              ))}
            </select>
          </Field>
          {prep.map((item) => (
            <label key={item.id} className="flex items-center gap-3 text-sm text-sand-100">
              <input
                type="checkbox"
                className="size-4 accent-spice-500"
                checked={checked.includes(item.id)}
                onChange={(event) =>
                  setChecked(event.target.checked ? [...checked, item.id] : checked.filter((id) => id !== item.id))
                }
              />
              {item.text}
            </label>
          ))}
          <Field label="Kit note">
            <input
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          </Field>
          <p className="text-xs text-sand-400">
            Shared with guild members viewing this operation. Not verified in game.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="btn btn-primary" disabled={busy}>
              Share readiness
            </Button>
            {own.readiness && (
              <Button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  onChange({ action: 'readiness', ...target(operation), readiness: null });
                  setEditing(false);
                }}
              >
                Stop sharing
              </Button>
            )}
            <Button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

const fleetListSchema = z.object({
  vehicles: z.array(z.object({ id: z.uuid(), name: z.string(), type: z.string() })),
  reservations: z.array(z.object({ vehicleId: z.uuid(), operationId: z.uuid().nullable() })),
});

/** N066 convoy plan: vehicles, crews, cargo loads and destinations for one operation. */
function Convoy({ guildId, operation, canEdit, now, busy, onChange }: Omit<Props, 'onReplace'>) {
  const [draft, setDraft] = useState<ConvoyVehicle[] | null>(null);
  const [fleet, setFleet] = useState<z.infer<typeof fleetListSchema> | null>(null);
  const [error, setError] = useState('');
  const convoy = operation.convoy ?? [];
  const editable = canEdit && operation.status !== 'cancelled' && Date.parse(operation.endsAt) > now;
  if (!convoy.length && !editable) return null;
  const crewName = (id: string) => operation.signups.find((entry) => entry.id === id)?.name ?? 'Former sign-up';
  const waypointName = (id: string | null) => operation.waypoints?.find((entry) => entry.id === id)?.label;
  async function start() {
    setDraft(
      convoy.map((entry) => ({ ...entry, crew: [...entry.crew], cargo: entry.cargo.map((load) => ({ ...load })) })),
    );
    setError('');
    try {
      setFleet(
        fleetListSchema.parse(
          await guildRequest(`/api/v2/guilds/${encodeURIComponent(guildId)}/logistics?section=fleet`),
        ),
      );
    } catch {
      setFleet(null);
      setError('The guild fleet could not be loaded. You can still enter vehicles by name.');
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = convoySchema.safeParse(draft);
    if (!parsed.success) {
      setError('Give every vehicle a name, use whole-number cargo quantities and assign each crew member once.');
      return;
    }
    onChange({ action: 'convoy', ...target(operation), convoy: parsed.data });
    setDraft(null);
  }
  const update = (id: string, patch: Partial<ConvoyVehicle>) =>
    setDraft((current) => current?.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) ?? null);
  return (
    <section aria-label="Convoy plan" className="mt-5">
      <h4 className="text-sm text-sand-100">Convoy plan</h4>
      {!convoy.length && !draft && <p className="mt-2 text-xs text-sand-500">No vehicles assigned yet.</p>}
      {!draft && (
        <ul className="mt-2 grid gap-2 text-sm">
          {convoy.map((entry) => (
            <li key={entry.id} className="min-w-0 border border-sand-200/10 p-2 text-sand-300">
              <p className="break-words text-sand-100">
                {entry.vehicleLabel}
                {entry.fleetVehicleId ? ' · Guild fleet' : ''}
              </p>
              <p className="break-words">
                Crew: {entry.crew.length ? entry.crew.map(crewName).join(', ') : 'Unassigned'}
              </p>
              <p className="break-words">
                Cargo:{' '}
                {entry.cargo.length
                  ? entry.cargo.map((load) => `${load.item} × ${load.quantity}`).join(', ')
                  : 'None planned'}
              </p>
              {(entry.destination || entry.waypointId) && (
                <p className="break-words">
                  Destination: {[waypointName(entry.waypointId), entry.destination].filter(Boolean).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && !draft && (
        <Button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={start}>
          Plan convoy
        </Button>
      )}
      {draft && (
        <form aria-label="Convoy planner" onSubmit={save} className="mt-3 grid gap-4 border border-sand-200/20 p-3">
          <FormMessage error={error} />
          {draft.map((entry, index) => {
            const booked = entry.fleetVehicleId
              ? fleet?.reservations.some(
                  (reservation) =>
                    reservation.vehicleId === entry.fleetVehicleId && reservation.operationId === operation.id,
                )
              : true;
            return (
              <fieldset key={entry.id} className="grid min-w-0 gap-3 border border-sand-200/10 p-3">
                <legend className="text-sm text-sand-200">Vehicle {index + 1}</legend>
                <Field label={`Vehicle ${index + 1} from guild fleet`}>
                  <select
                    value={entry.fleetVehicleId ?? ''}
                    onChange={(event) => {
                      const vehicle = fleet?.vehicles.find((item) => item.id === event.target.value);
                      update(entry.id, {
                        fleetVehicleId: vehicle?.id ?? null,
                        vehicleLabel: vehicle ? `${vehicle.name} (${vehicle.type})`.slice(0, 80) : entry.vehicleLabel,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Not from the guild fleet</option>
                    {fleet?.vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} · {vehicle.type}
                      </option>
                    ))}
                  </select>
                </Field>
                {!booked && (
                  <p className="text-xs text-status-warn">
                    This fleet vehicle has no dispatch booking for this operation yet. Book it in Logistics.
                  </p>
                )}
                <Field label={`Vehicle ${index + 1} name`}>
                  <input
                    maxLength={80}
                    value={entry.vehicleLabel}
                    onChange={(event) => update(entry.id, { vehicleLabel: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <fieldset className="grid gap-2">
                  <legend className="text-xs text-sand-400">Crew · up to {OPERATION_CONVOY_CREW_LIMIT}</legend>
                  {operation.signups.map((signup) => {
                    const elsewhere = draft.some((other) => other.id !== entry.id && other.crew.includes(signup.id));
                    return (
                      <label key={signup.id} className="flex items-center gap-3 text-sm text-sand-100">
                        <input
                          type="checkbox"
                          className="size-4 accent-spice-500"
                          disabled={
                            elsewhere ||
                            (!entry.crew.includes(signup.id) && entry.crew.length >= OPERATION_CONVOY_CREW_LIMIT)
                          }
                          checked={entry.crew.includes(signup.id)}
                          onChange={(event) =>
                            update(entry.id, {
                              crew: event.target.checked
                                ? [...entry.crew, signup.id]
                                : entry.crew.filter((id) => id !== signup.id),
                            })
                          }
                        />
                        {signup.name} · {operationRoleLabel[signup.role]}
                        {elsewhere ? ' · in another vehicle' : ''}
                      </label>
                    );
                  })}
                </fieldset>
                {entry.cargo.map((load, cargoIndex) => (
                  <div
                    key={cargoIndex}
                    className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
                  >
                    <Field label={`Vehicle ${index + 1} cargo item ${cargoIndex + 1}`}>
                      <input
                        maxLength={80}
                        value={load.item}
                        onChange={(event) =>
                          update(entry.id, {
                            cargo: entry.cargo.map((item, i) =>
                              i === cargoIndex ? { ...item, item: event.target.value } : item,
                            ),
                          })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        inputMode="numeric"
                        value={load.quantity}
                        onChange={(event) =>
                          update(entry.id, {
                            cargo: entry.cargo.map((item, i) =>
                              i === cargoIndex ? { ...item, quantity: event.target.value.trim() } : item,
                            ),
                          })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => update(entry.id, { cargo: entry.cargo.filter((_, i) => i !== cargoIndex) })}
                    >
                      Remove cargo
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  className="btn btn-secondary justify-self-start"
                  disabled={entry.cargo.length >= OPERATION_CARGO_LIMIT}
                  onClick={() => update(entry.id, { cargo: [...entry.cargo, { item: '', quantity: '1' }] })}
                >
                  Add cargo load
                </Button>
                <Field label={`Vehicle ${index + 1} destination waypoint`}>
                  <select
                    value={entry.waypointId ?? ''}
                    onChange={(event) => update(entry.id, { waypointId: event.target.value || null })}
                    className={inputClass}
                  >
                    <option value="">No waypoint</option>
                    {operation.waypoints?.map((waypoint) => (
                      <option key={waypoint.id} value={waypoint.id}>
                        {waypoint.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Vehicle ${index + 1} destination notes`}>
                  <input
                    maxLength={200}
                    value={entry.destination}
                    onChange={(event) => update(entry.id, { destination: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Button
                  type="button"
                  className="btn btn-secondary justify-self-start"
                  onClick={() => setDraft(draft.filter((item) => item.id !== entry.id))}
                >
                  Remove vehicle {index + 1}
                </Button>
              </fieldset>
            );
          })}
          <p className="text-xs text-sand-400">
            Cargo is a plan only. Item weights are not reported, so check vehicle capacity in game before loading.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="btn btn-secondary"
              disabled={draft.length >= OPERATION_CONVOY_LIMIT}
              onClick={() =>
                setDraft([
                  ...draft,
                  {
                    id: crypto.randomUUID(),
                    fleetVehicleId: null,
                    vehicleLabel: '',
                    crew: [],
                    cargo: [],
                    destination: '',
                    waypointId: null,
                  },
                ])
              }
            >
              Add vehicle
            </Button>
            <Button type="submit" className="btn btn-primary" disabled={busy}>
              Save convoy plan
            </Button>
            <Button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

const uploadSchema = z.object({ operation: operationsViewSchema.shape.operations.element });

/** N069 after-action report: outcome, lessons, screenshots and reviewed follow-up tasks. */
function AfterAction({ guildId, operation, canEdit, now, busy, onChange, onReplace }: Props) {
  const [editing, setEditing] = useState(false);
  const [outcome, setOutcome] = useState(operation.report?.outcome ?? 'success');
  const [summary, setSummary] = useState(operation.report?.summary ?? '');
  const [lessons, setLessons] = useState((operation.report?.lessons ?? []).join('\n'));
  const [followUp, setFollowUp] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  if (!operationReviewable(operation, now)) return null;
  const contributor = canEdit || operation.isParticipant;
  const report = operation.report;
  const followUps = operation.followUps ?? [];
  const base = `/api/v2/guilds/${encodeURIComponent(guildId)}/operations/${operation.id}/screenshots`;
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = reportDraftSchema.safeParse({
      outcome,
      summary,
      lessons: lessons
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(
        `Keep the summary under 2,000 characters and list up to ${OPERATION_LESSON_LIMIT} lessons of 300 characters.`,
      );
      return;
    }
    setError('');
    onChange({ action: 'report', ...target(operation), report: parsed.data });
    setEditing(false);
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('revision', operation.revision);
      form.set('caption', caption);
      form.set('image', file);
      const response = await fetch(base, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'The screenshot could not be added.');
      onReplace(uploadSchema.parse(payload.data).operation);
      setFile(null);
      setCaption('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The screenshot could not be added.');
    } finally {
      setUploading(false);
    }
  }
  return (
    <section aria-label="After-action report" className="mt-5 border-t border-sand-200/10 pt-4">
      <h4 className="text-sm text-sand-100">After-action report</h4>
      <FormMessage error={error} />
      {report ? (
        <div className="mt-2 grid gap-2 text-sm text-sand-300">
          <p className="text-spice-300">{reportOutcomeLabel[report.outcome]}</p>
          {report.summary && <p className="whitespace-pre-wrap break-words">{report.summary}</p>}
          {report.lessons.length > 0 && (
            <ul aria-label="Lessons" className="list-disc pl-5">
              {report.lessons.map((lesson, index) => (
                <li key={index} className="break-words">
                  {lesson}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-sand-500">
            Written by {report.authorName} · <LocalTime value={report.updatedAt} />
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-sand-500">No report written yet.</p>
      )}
      {canEdit && !editing && (
        <Button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={() => setEditing(true)}>
          {report ? 'Edit report' : 'Write report'}
        </Button>
      )}
      {canEdit && editing && (
        <form aria-label="Report editor" onSubmit={submit} className="mt-3 grid gap-3 border border-sand-200/20 p-3">
          <Field label="Outcome">
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
              className={inputClass}
            >
              {reportOutcomes.map((value) => (
                <option key={value} value={value}>
                  {reportOutcomeLabel[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Summary">
            <textarea
              rows={4}
              maxLength={2000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Lessons" hint="One per line">
            <textarea
              rows={4}
              value={lessons}
              onChange={(event) => setLessons(event.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="btn btn-primary" disabled={busy}>
              Save report
            </Button>
            <Button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <h5 className="mt-4 text-sm text-sand-200">Screenshots</h5>
      {operation.screenshots.length ? (
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operation.screenshots.map((shot) => (
            <li key={shot.id} className="min-w-0 border border-sand-200/10 p-2 text-xs text-sand-300">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated same-origin image */}
              <img
                src={`${base}/${shot.id}`}
                alt={shot.caption || `Screenshot from ${operation.title}`}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              {shot.caption && <p className="mt-1 break-words">{shot.caption}</p>}
              <p className="mt-1 text-sand-500">
                {shot.uploadedBy} · <LocalTime value={shot.uploadedAt} />
              </p>
              {shot.canRemove && (
                <Button
                  type="button"
                  className="btn btn-secondary mt-2"
                  disabled={busy}
                  onClick={() => onChange({ action: 'screenshot-remove', ...target(operation), screenshotId: shot.id })}
                >
                  Remove screenshot
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-sand-500">No screenshots.</p>
      )}
      {contributor && operation.screenshots.length < OPERATION_SCREENSHOT_LIMIT && (
        <form
          aria-label="Add screenshot"
          onSubmit={upload}
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Field label="Screenshot" hint="PNG, JPEG or WebP up to 700 KiB">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className={inputClass}
            />
          </Field>
          <Field label="Caption">
            <input
              maxLength={200}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Button type="submit" className="btn btn-secondary" disabled={!file || uploading || busy}>
            {uploading ? 'Uploading…' : 'Add screenshot'}
          </Button>
        </form>
      )}
      <h5 className="mt-4 text-sm text-sand-200">Follow-up tasks</h5>
      {followUps.length ? (
        <ul aria-label="Follow-up tasks" className="mt-2 grid gap-2 text-sm">
          {followUps.map((task) => (
            <li key={task.id} className="min-w-0 border border-sand-200/10 p-2 text-sand-300">
              <p className="break-words text-sand-100">{task.text}</p>
              <p className="text-xs text-sand-500">
                {followUpStatusLabel[task.status]} · proposed by {task.proposedBy}
              </p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.status !== 'accepted' && task.status !== 'done' && (
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        onChange({
                          action: 'follow-up-review',
                          ...target(operation),
                          followUpId: task.id,
                          status: 'accepted',
                        })
                      }
                    >
                      Accept
                    </Button>
                  )}
                  {task.status === 'proposed' && (
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        onChange({
                          action: 'follow-up-review',
                          ...target(operation),
                          followUpId: task.id,
                          status: 'declined',
                        })
                      }
                    >
                      Decline
                    </Button>
                  )}
                  {task.status === 'accepted' && (
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        onChange({
                          action: 'follow-up-review',
                          ...target(operation),
                          followUpId: task.id,
                          status: 'done',
                        })
                      }
                    >
                      Mark done
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-sand-500">No follow-up tasks proposed.</p>
      )}
      {contributor && (
        <form
          aria-label="Propose follow-up"
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!followUp.trim()) return;
            onChange({ action: 'follow-up', ...target(operation), text: followUp.trim() });
            setFollowUp('');
          }}
        >
          <div className="min-w-0 flex-1">
            <Field label="New follow-up task">
              <input
                maxLength={300}
                value={followUp}
                onChange={(event) => setFollowUp(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Button type="submit" className="btn btn-secondary" disabled={busy || !followUp.trim()}>
            Propose follow-up
          </Button>
        </form>
      )}
    </section>
  );
}

export function OperationExtras(props: Props) {
  return (
    <>
      <Briefings operation={props.operation} canEdit={props.canEdit} />
      <Waypoints operation={props.operation} />
      <Readiness operation={props.operation} now={props.now} busy={props.busy} onChange={props.onChange} />
      <Convoy
        guildId={props.guildId}
        operation={props.operation}
        canEdit={props.canEdit}
        now={props.now}
        busy={props.busy}
        onChange={props.onChange}
      />
      <AfterAction {...props} />
    </>
  );
}
