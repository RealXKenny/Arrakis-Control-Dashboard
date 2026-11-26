'use client';
import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { CheckField, Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { StatusBadge } from '../../../components/ui/status-badge';
import { MAP_LABELS, MAP_NAMES, MAP_PATHS, type MapName } from '../../map/maps';
import { departureChecks, type DeepDesertStatus } from '../departure';
import { useExpeditionPlan, useFleet } from '../hooks/use-expedition-data';
import {
  DEFAULT_DEPARTURE_ITEMS,
  estimateRoute,
  formatKm,
  PLAN_LIMITS,
  sectorFor,
  type Bookmark,
  type PlanData,
} from '../model';
import { RescuePanel } from './rescue-panel';

const sectionTitle = 'text-base font-semibold text-sand-50';
const muted = 'text-sm text-sand-400';
type Save = (plan: PlanData, done?: string) => Promise<boolean>;

function where(map: MapName, x: number | null, y: number | null) {
  const sector = sectorFor(map, x, y);
  const coordinates = x === null || y === null ? 'no coordinates' : `${Math.round(x)}, ${Math.round(y)}`;
  return `${MAP_LABELS[map]}${sector ? ` · sector ${sector}` : ''} · ${coordinates}`;
}
function parseCoordinate(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** N036–N040: private bookmarks, routes, scouting notes, departure readiness and opt-in rescue cards. */
export function ExpeditionPlanner({ deepDesert }: { deepDesert: DeepDesertStatus }) {
  const plans = useExpeditionPlan();
  const plan = plans.plan;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void plans.load()} disabled={plans.busy}>
          Refresh plans
        </Button>
        <p className={muted}>
          Plans are private to you and your linked character. Distances are straight-line planning estimates.
        </p>
      </div>
      <FormMessage error={plans.error} status={plans.status} />
      {plan && (
        <>
          <Bookmarks plan={plan} save={plans.save} busy={plans.busy} />
          <Routes plan={plan} save={plans.save} busy={plans.busy} />
          <Journal plan={plan} save={plans.save} busy={plans.busy} />
          <Departure plan={plan} save={plans.save} busy={plans.busy} deepDesert={deepDesert} />
        </>
      )}
      <RescuePanel bookmarks={plan?.bookmarks ?? []} />
    </div>
  );
}

function LocationFields({
  map,
  setMap,
  x,
  setX,
  y,
  setY,
  required,
}: {
  map: MapName;
  setMap: (map: MapName) => void;
  x: string;
  setX: (value: string) => void;
  y: string;
  setY: (value: string) => void;
  required: boolean;
}) {
  return (
    <>
      <Field label="Map">
        <select className={inputClass} value={map} onChange={(e) => setMap(e.target.value as MapName)}>
          {MAP_NAMES.map((name) => (
            <option key={name} value={name}>
              {MAP_LABELS[name]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="X coordinate" hint="World units from the map's marker details.">
        <input
          className={inputClass}
          required={required}
          inputMode="decimal"
          value={x}
          onChange={(e) => setX(e.target.value)}
        />
      </Field>
      <Field label="Y coordinate">
        <input
          className={inputClass}
          required={required}
          inputMode="decimal"
          value={y}
          onChange={(e) => setY(e.target.value)}
        />
      </Field>
    </>
  );
}

function Bookmarks({ plan, save, busy }: { plan: PlanData; save: Save; busy: boolean }) {
  const [map, setMap] = useState<MapName>('HaggaBasin');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const px = parseCoordinate(x);
    const py = parseCoordinate(y);
    if (px === null || py === null || Number.isNaN(px) || Number.isNaN(py)) {
      setError('Enter both coordinates as numbers.');
      return;
    }
    setError('');
    const bookmark: Bookmark = { id: crypto.randomUUID(), map, x: px, y: py, label: label.trim(), note: note.trim() };
    if (await save({ ...plan, bookmarks: [...plan.bookmarks, bookmark] }, 'Bookmark saved.')) {
      setLabel('');
      setNote('');
      setX('');
      setY('');
    }
  }
  async function remove(id: string) {
    const used = plan.routes.filter((route) => route.waypointIds.includes(id));
    if (used.length) {
      setError(`Remove it from route "${used[0].name}" first.`);
      return;
    }
    setError('');
    await save({ ...plan, bookmarks: plan.bookmarks.filter((entry) => entry.id !== id) }, 'Bookmark removed.');
  }
  return (
    <Card as="section" aria-labelledby="bookmarks" className="ui-card grid gap-4 p-5">
      <h2 id="bookmarks" className={sectionTitle}>
        Map bookmarks
      </h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <LocationFields map={map} setMap={setMap} x={x} setX={setX} y={y} setY={setY} required />
        <Field label="Name">
          <input
            className={inputClass}
            required
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Note">
          <input className={inputClass} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="primary" disabled={busy || plan.bookmarks.length >= PLAN_LIMITS.bookmarks}>
            Save bookmark
          </Button>
        </div>
      </form>
      <FormMessage error={error} />
      {plan.bookmarks.length === 0 ? (
        <p className={muted}>No bookmarks yet.</p>
      ) : (
        <ul className="grid gap-2">
          {plan.bookmarks.map((bookmark) => (
            <li key={bookmark.id} className="flex flex-wrap items-center gap-3 border-b border-sand-200/10 pb-2">
              <span className="font-semibold text-sand-50">{bookmark.label}</span>
              <span className={muted}>{where(bookmark.map, bookmark.x, bookmark.y)}</span>
              {bookmark.note && <span className="text-sm text-sand-200">{bookmark.note}</span>}
              <a className="text-sm text-spice-300 underline" href={MAP_PATHS[bookmark.map]}>
                Open map
              </a>
              <Button variant="ghost" disabled={busy} onClick={() => void remove(bookmark.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Routes({ plan, save, busy }: { plan: PlanData; save: Save; busy: boolean }) {
  const [map, setMap] = useState<MapName>('HaggaBasin');
  const [name, setName] = useState('');
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const available = plan.bookmarks.filter((bookmark) => bookmark.map === map);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const route = { id: crypto.randomUUID(), name: name.trim(), map, waypointIds: waypoints };
    if (await save({ ...plan, routes: [...plan.routes, route] }, 'Route saved.')) {
      setName('');
      setWaypoints([]);
    }
  }
  return (
    <Card as="section" aria-labelledby="routes" className="ui-card grid gap-4 p-5">
      <h2 id="routes" className={sectionTitle}>
        Exploration routes
      </h2>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Route name">
            <input
              className={inputClass}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Map">
            <select
              className={inputClass}
              value={map}
              onChange={(e) => {
                setMap(e.target.value as MapName);
                setWaypoints([]);
              }}
            >
              {MAP_NAMES.map((entry) => (
                <option key={entry} value={entry}>
                  {MAP_LABELS[entry]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add waypoint">
            <select
              className={inputClass}
              value=""
              onChange={(e) => e.target.value && setWaypoints((current) => [...current, e.target.value])}
              disabled={waypoints.length >= PLAN_LIMITS.waypoints}
            >
              <option value="">{available.length ? 'Choose a bookmark' : 'Save bookmarks on this map first'}</option>
              {available.map((bookmark) => (
                <option key={bookmark.id} value={bookmark.id}>
                  {bookmark.label}
                </option>
              ))}
            </select>
          </Field>
          {waypoints.length > 0 && (
            <Button type="button" onClick={() => setWaypoints((current) => current.slice(0, -1))}>
              Remove last
            </Button>
          )}
        </div>
        <p className="text-sm text-sand-200">
          {waypoints.length
            ? waypoints.map((id) => plan.bookmarks.find((entry) => entry.id === id)?.label ?? 'Missing').join(' → ')
            : 'Choose at least two waypoints in order.'}
        </p>
        <div>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || waypoints.length < 2 || plan.routes.length >= PLAN_LIMITS.routes}
          >
            Save route
          </Button>
        </div>
      </form>
      <ul className="grid gap-3">
        {plan.routes.map((route) => {
          const estimate = estimateRoute(route, plan.bookmarks);
          return (
            <li key={route.id} className="grid gap-1 border-b border-sand-200/10 pb-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-sand-50">{route.name}</span>
                <span className={muted}>
                  {MAP_LABELS[route.map]} · ≈ {formatKm(estimate.km)} straight-line estimate
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      {
                        ...plan,
                        routes: plan.routes.filter((entry) => entry.id !== route.id),
                        departure:
                          plan.departure.routeId === route.id ? { ...plan.departure, routeId: null } : plan.departure,
                      },
                      'Route removed.',
                    )
                  }
                >
                  Remove
                </Button>
              </div>
              <ol className="text-sm text-sand-200">
                {estimate.legs.map((leg, index) => (
                  <li key={`${leg.from.id}-${index}`}>
                    {leg.from.label} → {leg.to.label}: ≈ {formatKm(leg.km)}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Journal({ plan, save, busy }: { plan: PlanData; save: Save; busy: boolean }) {
  const [map, setMap] = useState<MapName>('HaggaBasin');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [title, setTitle] = useState('');
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const px = parseCoordinate(x);
    const py = parseCoordinate(y);
    if (Number.isNaN(px) || Number.isNaN(py) || (px === null) !== (py === null)) {
      setError('Enter both coordinates as numbers, or leave both empty.');
      return;
    }
    setError('');
    const entry = {
      id: crypto.randomUUID(),
      map,
      x: px,
      y: py,
      title: title.trim(),
      observation: observation.trim(),
      checkedAt: new Date().toISOString(),
    };
    if (await save({ ...plan, journal: [entry, ...plan.journal] }, 'Journal entry saved.')) {
      setTitle('');
      setObservation('');
    }
  }
  return (
    <Card as="section" aria-labelledby="scouting-journal" className="ui-card grid gap-4 p-5">
      <h2 id="scouting-journal" className={sectionTitle}>
        Scouting journal
      </h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <LocationFields map={map} setMap={setMap} x={x} setX={setX} y={y} setY={setY} required={false} />
        <Field label="Title">
          <input
            className={inputClass}
            required
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Observation">
            <textarea
              className={inputClass}
              maxLength={500}
              rows={2}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={busy || plan.journal.length >= PLAN_LIMITS.journal}>
            Save entry
          </Button>
        </div>
      </form>
      <FormMessage error={error} />
      <ul className="grid gap-2">
        {plan.journal.map((entry) => (
          <li key={entry.id} className="grid gap-1 border-b border-sand-200/10 pb-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-sand-50">{entry.title}</span>
              <span className={muted}>{where(entry.map, entry.x, entry.y)}</span>
              <span className={muted}>
                Last checked <LocalTime value={entry.checkedAt} />
              </span>
            </div>
            {entry.observation && <p className="text-sm text-sand-200">{entry.observation}</p>}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void save(
                    {
                      ...plan,
                      journal: plan.journal.map((item) =>
                        item.id === entry.id ? { ...item, checkedAt: new Date().toISOString() } : item,
                      ),
                    },
                    'Marked as checked now.',
                  )
                }
              >
                Checked now
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void save({ ...plan, journal: plan.journal.filter((item) => item.id !== entry.id) }, 'Entry removed.')
                }
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Departure({
  plan,
  save,
  busy,
  deepDesert,
}: {
  plan: PlanData;
  save: Save;
  busy: boolean;
  deepDesert: DeepDesertStatus;
}) {
  const fleet = useFleet();
  const [tripHours, setTripHours] = useState(3);
  const [item, setItem] = useState('');
  const [now] = useState(() => Date.now());
  const vehicle = fleet.fleet?.vehicles.find((entry) => entry.id === plan.departure.vehicleId) ?? null;
  const checks = departureChecks({ plan, status: deepDesert, vehicle, cargo: fleet.cargo, now, tripHours });
  const deepRoutes = plan.routes.filter((route) => route.map === 'DeepDesert');
  const setDeparture = (next: Partial<PlanData['departure']>, message = 'Departure plan saved.') =>
    save({ ...plan, departure: { ...plan.departure, ...next } }, message);
  const vehicleOptions = fleet.fleet?.vehicles ?? [];
  return (
    <Card as="section" aria-labelledby="departure" className="ui-card grid gap-4 p-5">
      <h2 id="departure" className={sectionTitle}>
        Deep Desert departure checklist
      </h2>
      <p className={muted}>
        {deepDesert.available && deepDesert.nextCycleAt ? (
          <>
            Next reported Coriolis cycle <LocalTime value={deepDesert.nextCycleAt} />
            {deepDesert.layout !== null && ` · layout ${deepDesert.layout}`} · checked{' '}
            <LocalTime value={deepDesert.checkedAt} />.
          </>
        ) : (
          'The Console did not report Deep Desert cycle information.'
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="Route">
          <select
            className={inputClass}
            value={plan.departure.routeId ?? ''}
            disabled={busy}
            onChange={(e) => void setDeparture({ routeId: e.target.value || null })}
          >
            <option value="">No route</option>
            {deepRoutes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manifest">
          <select
            className={inputClass}
            value={plan.departure.manifestId ?? ''}
            disabled={busy}
            onChange={(e) => void setDeparture({ manifestId: e.target.value || null })}
          >
            <option value="">No manifest</option>
            {plan.manifests.map((manifest) => (
              <option key={manifest.id} value={manifest.id}>
                {manifest.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle">
          <select
            className={inputClass}
            value={plan.departure.vehicleId ?? ''}
            disabled={busy}
            onChange={(e) => void setDeparture({ vehicleId: e.target.value || null })}
          >
            <option value="">No vehicle</option>
            {plan.departure.vehicleId && !vehicleOptions.some((entry) => entry.id === plan.departure.vehicleId) && (
              <option value={plan.departure.vehicleId}>Vehicle #{plan.departure.vehicleId}</option>
            )}
            {vehicleOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {plan.vehicles.find((label) => label.vehicleId === entry.id)?.nickname || entry.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Planned trip (hours)">
          <input
            className={inputClass}
            type="number"
            min={1}
            max={48}
            value={tripHours}
            onChange={(e) => setTripHours(Math.min(48, Math.max(1, Number(e.target.value) || 1)))}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void fleet.checkFleet()} disabled={fleet.busy}>
          {fleet.busy ? 'Checking…' : 'Check fleet'}
        </Button>
        <Button
          onClick={() => plan.departure.vehicleId && void fleet.checkCargo(plan.departure.vehicleId)}
          disabled={fleet.busy || !plan.departure.vehicleId}
        >
          Check cargo
        </Button>
        {plan.departure.items.length === 0 && (
          <Button
            disabled={busy}
            onClick={() =>
              void setDeparture(
                { items: DEFAULT_DEPARTURE_ITEMS.map((label) => ({ id: crypto.randomUUID(), label, done: false })) },
                'Suggested checklist added.',
              )
            }
          >
            Add suggested checklist
          </Button>
        )}
        {plan.departure.items.some((entry) => entry.done) && (
          <Button
            disabled={busy}
            onClick={() =>
              void setDeparture(
                { items: plan.departure.items.map((entry) => ({ ...entry, done: false })) },
                'Checklist reset.',
              )
            }
          >
            Reset ticks
          </Button>
        )}
      </div>
      <FormMessage error={fleet.error} />
      <ul className="grid gap-2">
        {checks.map((check) => (
          <li key={check.id} className="flex flex-wrap items-center gap-3">
            <StatusBadge
              tone={check.state === 'ready' ? 'success' : check.state === 'attention' ? 'warning' : 'neutral'}
            >
              {check.state === 'ready' ? 'Ready' : check.state === 'attention' ? 'Check' : 'Unknown'}
            </StatusBadge>
            <span className="font-semibold text-sand-50">{check.label}</span>
            <span className={muted}>{check.detail}</span>
          </li>
        ))}
      </ul>
      {plan.departure.items.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
            Your checklist
          </legend>
          {plan.departure.items.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3">
              <CheckField
                label={entry.label}
                checked={entry.done}
                onChange={(done) =>
                  void setDeparture({
                    items: plan.departure.items.map((itemEntry) =>
                      itemEntry.id === entry.id ? { ...itemEntry, done } : itemEntry,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void setDeparture({ items: plan.departure.items.filter((itemEntry) => itemEntry.id !== entry.id) })
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </fieldset>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void setDeparture({
            items: [...plan.departure.items, { id: crypto.randomUUID(), label: item.trim(), done: false }],
          }).then((ok) => ok && setItem(''));
        }}
      >
        <Field label="Add checklist item">
          <input
            className={inputClass}
            required
            maxLength={120}
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy || plan.departure.items.length >= PLAN_LIMITS.checklist}>
          Add
        </Button>
      </form>
    </Card>
  );
}
