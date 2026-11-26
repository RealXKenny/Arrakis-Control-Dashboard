'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { StatusBadge } from '../../../components/ui/status-badge';
import { useExpeditionPlan, useFleet } from '../../expeditions/hooks/use-expedition-data';
import { PLAN_LIMITS, type Manifest, type PlanData, type VehicleLabel } from '../../expeditions/model';
import {
  compareComponents,
  compareManifest,
  LIFECYCLE_LABELS,
  maintenanceInbox,
  mapLabel,
  type FleetVehicle,
} from '../fleet';

const sectionTitle = 'text-base font-semibold text-sand-50';
const muted = 'text-sm text-sand-400';
const pct = (value: number | null, estimated = false) =>
  value === null ? 'Unknown' : `${value}%${estimated ? ' (est.)' : ''}`;

function displayName(vehicle: FleetVehicle, labels: VehicleLabel[]) {
  const label = labels.find((entry) => entry.vehicleId === vehicle.id);
  return label?.nickname ? `${label.nickname} (${vehicle.name})` : vehicle.name;
}

/** N031–N035: fleet tools over a fresh, roster-verified reading plus private labels and manifests. */
export function FleetTools() {
  const plans = useExpeditionPlan();
  const fleet = useFleet();
  const plan = plans.plan;
  const vehicles = fleet.fleet?.vehicles ?? [];

  return (
    <section aria-labelledby="fleet-tools" className="mt-10 grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="fleet-tools" className="text-xl font-semibold text-sand-50">
            Fleet tools
          </h2>
          <p className={muted}>
            Readings are fetched only when you ask and checked against each vehicle&apos;s permission roster. Labels and
            manifests are private planning notes; they never rename, move or reserve anything in game.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void fleet.checkFleet()} disabled={fleet.busy}>
            {fleet.busy ? 'Checking…' : fleet.fleet ? 'Check again' : 'Check fleet'}
          </Button>
          <Button onClick={() => void plans.load()} disabled={plans.busy}>
            Refresh plans
          </Button>
        </div>
      </div>
      <FormMessage error={fleet.error || plans.error} status={plans.status} />
      {fleet.fleet && (
        <p className={muted} role="status">
          {vehicles.length} verified vehicle(s), read <LocalTime value={fleet.fleet.observedAt} />.
          {fleet.fleet.excluded > 0 &&
            ` ${fleet.fleet.excluded} listed vehicle(s) could not be verified and are hidden.`}
          {fleet.fleet.limited && ' Only the first 20 vehicles are checked; this reading is partial.'}
        </p>
      )}
      {plan && fleet.fleet && (
        <>
          <MaintenanceInbox plan={plan} vehicles={vehicles} save={plans.save} busy={plans.busy} />
          <Locator plan={plan} vehicles={vehicles} save={plans.save} busy={plans.busy} />
          <ComponentComparison plan={plan} vehicles={vehicles} />
        </>
      )}
      {plan && (
        <CargoPlanner
          plan={plan}
          vehicles={vehicles}
          save={plans.save}
          busy={plans.busy || fleet.busy}
          cargo={fleet.cargo}
          checkCargo={fleet.checkCargo}
        />
      )}
    </section>
  );
}

type Save = (plan: PlanData, done?: string) => Promise<boolean>;

function MaintenanceInbox({
  plan,
  vehicles,
  save,
  busy,
}: {
  plan: PlanData;
  vehicles: FleetVehicle[];
  save: Save;
  busy: boolean;
}) {
  const [fuel, setFuel] = useState(String(plan.thresholds.fuelPercent));
  const [condition, setCondition] = useState(String(plan.thresholds.conditionPercent));
  const items = maintenanceInbox(vehicles, plan.thresholds);
  function submit(event: FormEvent) {
    event.preventDefault();
    void save(
      { ...plan, thresholds: { fuelPercent: Number(fuel), conditionPercent: Number(condition) } },
      'Thresholds saved.',
    );
  }
  return (
    <Card as="section" aria-labelledby="maintenance-inbox" className="ui-card grid gap-4 p-5">
      <h3 id="maintenance-inbox" className={sectionTitle}>
        Maintenance inbox
      </h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Fuel at or below (%)">
          <input
            className={inputClass}
            type="number"
            min={0}
            max={100}
            required
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
          />
        </Field>
        <Field label="Component condition at or below (%)">
          <input
            className={inputClass}
            type="number"
            min={0}
            max={100}
            required
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Save thresholds
        </Button>
      </form>
      {items.length === 0 ? (
        <p className={muted}>No verified vehicle is at or below your thresholds, and every reading was reported.</p>
      ) : (
        <ol className="grid gap-2">
          {items.map((item) => (
            <li key={item.vehicle.id} className="flex flex-wrap items-center gap-3 border-l-2 border-sand-200/20 pl-3">
              <StatusBadge
                tone={item.severity === 'urgent' ? 'danger' : item.severity === 'watch' ? 'warning' : 'neutral'}
              >
                {item.severity === 'urgent' ? 'Urgent' : item.severity === 'watch' ? 'Watch' : 'Unknown'}
              </StatusBadge>
              <span className="font-semibold text-sand-50">{displayName(item.vehicle, plan.vehicles)}</span>
              <span className={muted}>{item.reasons.join(' · ')}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Locator({
  plan,
  vehicles,
  save,
  busy,
}: {
  plan: PlanData;
  vehicles: FleetVehicle[];
  save: Save;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card as="section" aria-labelledby="vehicle-locator" className="ui-card grid gap-4 p-5">
      <h3 id="vehicle-locator" className={sectionTitle}>
        Vehicle locator and labels
      </h3>
      <p className={muted}>
        Positions are the last observation the Console reported at the time of this reading, not live tracking. Stored
        and in-transit vehicles show their state instead of a position.
      </p>
      <ul className="grid gap-3">
        {vehicles.map((vehicle) => {
          const label = plan.vehicles.find((entry) => entry.vehicleId === vehicle.id);
          return (
            <li key={vehicle.id} className="grid gap-2 border-b border-sand-200/10 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sand-50">{displayName(vehicle, plan.vehicles)}</span>
                <span className={muted}>
                  {vehicle.type} · {vehicle.relationship}
                </span>
                <StatusBadge tone={vehicle.lifecycle === 'deployed' ? 'success' : 'neutral'}>
                  {LIFECYCLE_LABELS[vehicle.lifecycle]}
                </StatusBadge>
              </div>
              <p className="text-sm text-sand-200">
                {mapLabel(vehicle.map)}
                {vehicle.region && ` · ${vehicle.region}`}
                {vehicle.sector && ` · sector ${vehicle.sector}`}
                {vehicle.position
                  ? ` · last observed at ${Math.round(vehicle.position.x)}, ${Math.round(vehicle.position.y)}`
                  : ' · no deployed position'}
                {vehicle.storedAt && (
                  <>
                    {' · stored '}
                    <LocalTime value={vehicle.storedAt} />
                  </>
                )}
              </p>
              {label && (label.tags.length > 0 || label.purpose) && (
                <p className={muted}>
                  {label.tags.map((tag) => `#${tag}`).join(' ')}
                  {label.purpose && ` ${label.purpose}`}
                </p>
              )}
              {editing === vehicle.id ? (
                <LabelEditor
                  vehicleId={vehicle.id}
                  initial={label}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (next) => {
                    const others = plan.vehicles.filter((entry) => entry.vehicleId !== vehicle.id);
                    const empty = !next.nickname && next.tags.length === 0 && !next.purpose;
                    if (!empty && others.length >= PLAN_LIMITS.vehicles) return;
                    if (await save({ ...plan, vehicles: empty ? others : [...others, next] }, 'Label saved.'))
                      setEditing(null);
                  }}
                />
              ) : (
                <div>
                  <Button onClick={() => setEditing(vehicle.id)} disabled={busy}>
                    {label ? 'Edit label' : 'Add label'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LabelEditor({
  vehicleId,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  vehicleId: string;
  initial: VehicleLabel | undefined;
  busy: boolean;
  onSave: (label: VehicleLabel) => Promise<void>;
  onCancel: () => void;
}) {
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const list = [
          ...new Map(
            tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .map((tag) => [tag.toLowerCase(), tag.slice(0, 24)] as const),
          ).values(),
        ].slice(0, PLAN_LIMITS.tags);
        void onSave({ vehicleId, nickname: nickname.trim(), tags: list, purpose: purpose.trim() });
      }}
    >
      <Field label="Private nickname">
        <input className={inputClass} maxLength={40} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </Field>
      <Field label="Tags" hint="Comma separated, up to six.">
        <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Field label="Purpose">
        <input className={inputClass} maxLength={200} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" variant="primary" disabled={busy}>
          Save label
        </Button>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ComponentComparison({ plan, vehicles }: { plan: PlanData; vehicles: FleetVehicle[] }) {
  const [chosen, setChosen] = useState<string[]>(() => vehicles.slice(0, 3).map((vehicle) => vehicle.id));
  const selected = vehicles.filter((vehicle) => chosen.includes(vehicle.id));
  const rows = useMemo(() => compareComponents(selected), [selected]);
  return (
    <Card as="section" aria-labelledby="component-comparison" className="ui-card grid gap-4 p-5">
      <h3 id="component-comparison" className={sectionTitle}>
        Component comparison
      </h3>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Vehicles to compare (up to four)</legend>
        {vehicles.map((vehicle) => (
          <label key={vehicle.id} className="flex items-center gap-2 text-sm text-sand-100">
            <input
              type="checkbox"
              className="size-4 accent-spice-500"
              checked={chosen.includes(vehicle.id)}
              disabled={!chosen.includes(vehicle.id) && chosen.length >= 4}
              onChange={(e) =>
                setChosen((current) =>
                  e.target.checked ? [...current, vehicle.id] : current.filter((id) => id !== vehicle.id),
                )
              }
            />
            {displayName(vehicle, plan.vehicles)}
          </label>
        ))}
      </fieldset>
      {rows.length === 0 ? (
        <p className={muted}>The selected vehicles report no components.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="text-sand-400">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Component
                </th>
                {selected.map((vehicle) => (
                  <th key={vehicle.id} scope="col" className="py-2 pr-3 font-medium">
                    {displayName(vehicle, plan.vehicles)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-t border-sand-200/10">
                  <th scope="row" className="py-2 pr-3 font-normal text-sand-100">
                    {row.name}
                  </th>
                  {row.readings.map((reading) => (
                    <td
                      key={reading.vehicleId}
                      className={`py-2 pr-3 ${reading.weakest ? 'font-semibold text-status-danger' : 'text-sand-200'}`}
                    >
                      {pct(reading.percent, reading.estimated)}
                      {reading.weakest && <span className="sr-only"> (weakest)</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={muted}>
        The weakest reported reading per component is highlighted. Unknown readings are never counted as weakest, and
        estimated maximums are marked.
      </p>
    </Card>
  );
}

function CargoPlanner({
  plan,
  vehicles,
  save,
  busy,
  cargo,
  checkCargo,
}: {
  plan: PlanData;
  vehicles: FleetVehicle[];
  save: Save;
  busy: boolean;
  cargo: ReturnType<typeof useFleet>['cargo'];
  checkCargo: (vehicleId: string) => Promise<void>;
}) {
  const [manifestId, setManifestId] = useState(plan.manifests[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const manifest = plan.manifests.find((entry) => entry.id === manifestId) ?? null;
  const [draft, setDraft] = useState({ templateId: '', name: '', quantity: '' });
  const lines = manifest && cargo && cargo.vehicleId === vehicleId ? compareManifest(manifest, cargo) : null;

  function update(next: Manifest | null, removed?: string, message = 'Manifest saved.') {
    const manifests = plan.manifests.filter((entry) => entry.id !== (next?.id ?? removed));
    const departure =
      removed && plan.departure.manifestId === removed ? { ...plan.departure, manifestId: null } : plan.departure;
    return save({ ...plan, manifests: next ? [...manifests, next] : manifests, departure }, message);
  }

  return (
    <Card as="section" aria-labelledby="cargo-planner" className="ui-card grid gap-4 p-5">
      <h3 id="cargo-planner" className={sectionTitle}>
        Trip cargo planner
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Manifest">
          <select className={inputClass} value={manifestId} onChange={(e) => setManifestId(e.target.value)}>
            <option value="">Choose a manifest</option>
            {plan.manifests.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          disabled={busy || plan.manifests.length >= PLAN_LIMITS.manifests}
          onClick={async () => {
            const created = { id: crypto.randomUUID(), name: `Trip ${plan.manifests.length + 1}`, lines: [] };
            if (await update(created, undefined, 'Manifest created.')) setManifestId(created.id);
          }}
        >
          New manifest
        </Button>
        {manifest && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (await update(null, manifest.id, 'Manifest removed.')) setManifestId('');
            }}
          >
            Remove manifest
          </Button>
        )}
      </div>
      {manifest && (
        <>
          <ul className="grid gap-1 text-sm text-sand-100">
            {manifest.lines.map((line) => (
              <li key={line.templateId} className="flex flex-wrap items-center gap-3">
                <span>
                  {line.quantity} × {line.name} <span className="text-sand-500">({line.templateId})</span>
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void update({
                      ...manifest,
                      lines: manifest.lines.filter((entry) => entry.templateId !== line.templateId),
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const line = {
                templateId: draft.templateId.trim(),
                name: draft.name.trim() || draft.templateId.trim(),
                quantity: draft.quantity.trim(),
              };
              const others = manifest.lines.filter(
                (entry) => entry.templateId.toLowerCase() !== line.templateId.toLowerCase(),
              );
              void update({ ...manifest, lines: [...others, line] }).then((ok) => {
                if (ok) setDraft({ templateId: '', name: '', quantity: '' });
              });
            }}
          >
            <Field label="Item template ID" hint="As shown by the Storage item finder.">
              <input
                className={inputClass}
                required
                maxLength={128}
                value={draft.templateId}
                onChange={(e) => setDraft({ ...draft, templateId: e.target.value })}
              />
            </Field>
            <Field label="Item name">
              <input
                className={inputClass}
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Quantity">
              <input
                className={inputClass}
                required
                inputMode="numeric"
                pattern="[1-9][0-9]{0,17}"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={busy || manifest.lines.length >= PLAN_LIMITS.manifestLines}>
              Add item
            </Button>
          </form>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Vehicle cargo to compare">
              <select className={inputClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">{vehicles.length ? 'Choose a vehicle' : 'Check your fleet first'}</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {displayName(vehicle, plan.vehicles)}
                  </option>
                ))}
              </select>
            </Field>
            <Button disabled={busy || !vehicleId} onClick={() => void checkCargo(vehicleId)}>
              Check cargo
            </Button>
          </div>
          {lines && cargo && (
            <div className="grid gap-2">
              <p className={muted}>
                Cargo read <LocalTime value={cargo.observedAt} />
                {cargo.maxSlots !== null && ` · ${cargo.usedSlots ?? '?'} of ${cargo.maxSlots} slots used`}
                {cargo.maxVolume !== null &&
                  ` · volume ${cargo.volumeComplete ? '' : '≥ '}${cargo.currentVolume ?? '?'} of ${cargo.maxVolume}`}
                {cargo.limited && ' · partial reading; shortfalls may be overstated'}
              </p>
              <ul className="grid gap-1 text-sm">
                {lines.map((line) => (
                  <li key={line.templateId} className="flex flex-wrap items-center gap-3">
                    <StatusBadge
                      tone={line.status === 'loaded' ? 'success' : line.status === 'short' ? 'warning' : 'neutral'}
                    >
                      {line.status === 'loaded' ? 'Loaded' : line.status === 'short' ? 'Short' : 'Unknown'}
                    </StatusBadge>
                    <span className="text-sand-100">
                      {line.name}: {line.loaded} of {line.wanted}
                      {line.shortfall !== '0' && ` (need ${line.shortfall} more)`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
