'use client';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { projectQuantitySchema, solariAmountSchema, type ProjectView } from '../projects';
import type { Mutate, WorkspaceView } from '../projects';

const amount = (value: string) => BigInt(value).toLocaleString();
type Material = ProjectView['materials'][number];
type Contribution = ProjectView['contributions'][number];

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-3 min-w-0">
      <summary className="cursor-pointer text-sm text-spice-300">{label}</summary>
      <div className="mt-3 min-w-0">{children}</div>
    </details>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 border border-sand-200/10 p-2">
      <dt className="text-xs text-sand-400">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${strong ? 'font-bold text-sand-100' : 'text-sand-200'}`}>{value}</dd>
    </div>
  );
}

function QuantityForm({
  label,
  submit,
  busy,
  members,
  stock,
  initial,
}: {
  label: string;
  submit: (quantity: string, choice: string) => void;
  busy: boolean;
  members?: Array<{ key: string; name: string }>;
  stock?: Array<{ id: string; label: string }>;
  initial: string;
}) {
  const options = members?.map((entry) => ({ id: entry.key, label: entry.name })) ?? stock ?? [];
  const [quantity, setQuantity] = useState(initial);
  const [choice, setChoice] = useState(options[0]?.id ?? '');
  const [error, setError] = useState('');
  function send(event: FormEvent) {
    event.preventDefault();
    if (!projectQuantitySchema.safeParse(quantity).success || (options.length && !choice)) {
      setError('Enter a positive whole quantity, without commas, and make a choice.');
      return;
    }
    setError('');
    submit(quantity.trim(), choice);
  }
  if ((members || stock) && options.length === 0)
    return <p className="text-sm text-sand-400">Nothing is available to choose yet.</p>;
  return (
    <form aria-label={label} onSubmit={send} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
      <FormMessage error={error} />
      {options.length > 0 && (
        <Field label={members ? 'Member' : 'Published supply'}>
          <select value={choice} onChange={(event) => setChoice(event.target.value)} className={inputClass}>
            {options.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Quantity">
        <input
          required
          inputMode="numeric"
          maxLength={18}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex items-end">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          {label}
        </Button>
      </div>
    </form>
  );
}

export function ProjectCard({
  project,
  view,
  busy,
  editing,
  onEdit,
  mutate,
}: {
  project: ProjectView;
  view: WorkspaceView;
  guildId: string;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  mutate: Mutate;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = { id: project.id, revision: project.revision };
  const closed = project.status === 'completed' || project.status === 'cancelled';
  const self = view.selfKey;
  const manages = (material: Material) => view.canEdit || material.responsibleKey === self;
  const stockLabel = (id: string) => {
    const entry = view.stockpile.find((item) => item.id === id);
    return entry ? `${entry.material} from ${entry.ownerName}` : 'Unpublished supply';
  };
  const materialName = (id: string | null) =>
    id ? (project.materials.find((entry) => entry.id === id)?.name ?? 'Removed material') : 'General contribution';
  const summary = project.costSummary;

  return (
    <Card aria-label={project.name} className="min-w-0 border border-sand-200/20 p-4 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-spice-300">{project.status}</p>
      <h3 className="mt-3 break-words text-base">{project.name}</h3>
      {project.summary && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">{project.summary}</p>
      )}
      <p className="mt-3 text-xs text-sand-500">
        Created by {project.createdByName} · updated <LocalTime value={project.updatedAt} />
      </p>
      {view.canEdit && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" className="btn btn-secondary" disabled={busy || editing} onClick={onEdit}>
            Edit plan
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => mutate({ action: 'project-delete', ...target }, 'Project removed.')}
              >
                Confirm removal
              </Button>
              <Button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                Keep project
              </Button>
            </>
          ) : (
            <Button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Remove project
            </Button>
          )}
        </div>
      )}

      {project.milestones.length > 0 && (
        <section aria-label="Milestones" className="mt-5">
          <h4 className="text-sm">Milestones</h4>
          <ul className="mt-2 grid gap-2">
            {project.milestones.map((milestone) => {
              const allowed = !closed && (view.canEdit || milestone.responsibleKey === self);
              return (
                <li key={milestone.id} className="flex flex-wrap items-center gap-3 text-sm text-sand-200">
                  <input
                    type="checkbox"
                    aria-label={`${milestone.title} complete`}
                    checked={Boolean(milestone.completedAt)}
                    disabled={!allowed || busy}
                    onChange={(event) =>
                      mutate(
                        { action: 'milestone', ...target, milestoneId: milestone.id, done: event.target.checked },
                        'Milestone updated.',
                      )
                    }
                    className="size-4 accent-spice-500"
                  />
                  <span className="break-words">{milestone.title}</span>
                  <span className="text-xs text-sand-500">
                    {milestone.due ? `Target ${milestone.due}` : 'No target date'} ·{' '}
                    {milestone.responsibleName ?? 'Unassigned'}
                    {milestone.completedByName && ` · done by ${milestone.completedByName}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Materials" className="mt-5">
        <h4 className="text-sm">Materials</h4>
        {project.materials.length === 0 && <p className="mt-2 text-sm text-sand-400">No materials planned yet.</p>}
        <ul className="mt-2 grid gap-4">
          {project.materials.map((material) => {
            const coverage = material.coverage;
            const ownStock = view.stockpile.filter(
              (entry) => (view.canEdit || entry.ownerKey === self) && BigInt(entry.quantity) > BigInt(entry.reserved),
            );
            const openRequest = material.request?.status === 'open';
            return (
              <li key={material.id} aria-label={material.name} className="min-w-0 border-l-2 border-spice-400 p-3">
                <p className="break-words text-sm font-semibold text-sand-100">
                  {material.name}{' '}
                  <span className="font-normal text-sand-400">
                    · {material.unit} · responsible: {material.responsibleName ?? 'nobody yet'}
                  </span>
                </p>
                <dl className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
                  <Stat label="Required" value={amount(coverage.required)} />
                  <Stat label="Confirmed delivered" value={amount(coverage.accepted)} strong />
                  <Stat label="Reserved stock" value={amount(coverage.reserved)} />
                  <Stat label="Being bought" value={amount(coverage.procuring)} />
                  <Stat label="Shortage" value={amount(coverage.shortage)} strong />
                </dl>
                {material.request && (
                  <p className="mt-2 text-xs text-sand-400">
                    Linked resource request:{' '}
                    {material.request.status === 'missing'
                      ? 'no longer listed'
                      : `${material.request.status}, ${amount(material.request.committed)} pledged, ${amount(material.request.delivered)} confirmed`}{' '}
                    · <Link href="/guild?tab=resources">Open resource requests</Link>
                  </p>
                )}
                <p className="mt-2 text-xs text-sand-400">
                  {material.estimate
                    ? material.estimate.unitPrice
                      ? `Observed lowest asking price ${amount(material.estimate.unitPrice)} Solari per unit across ${material.estimate.listingCount} listings`
                      : 'No in-stock listings were observed'
                    : material.templateId
                      ? 'No market observation yet'
                      : 'No exchange item ID, so no market estimate'}
                  {material.estimate && (
                    <>
                      {material.estimate.partial && ' (partial read)'} · observed{' '}
                      <LocalTime value={material.estimate.observedAt} />
                    </>
                  )}
                </p>
                {!closed && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {manages(material) && material.templateId && (
                      <Button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            { action: 'observe-price', ...target, materialId: material.id },
                            'Market listings observed.',
                          )
                        }
                      >
                        Observe market price
                      </Button>
                    )}
                    {manages(material) && material.request && !openRequest && (
                      <Button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            { action: 'unlink-request', ...target, materialId: material.id },
                            'Request link cleared.',
                          )
                        }
                      >
                        Clear request link
                      </Button>
                    )}
                  </div>
                )}
                {!closed && coverage.shortage !== '0' && !openRequest && view.requestsAvailable && (
                  <Disclosure label="Prepare a resource request for the shortage">
                    <ShortageForm
                      busy={busy}
                      shortage={coverage.shortage}
                      unit={material.unit}
                      onSubmit={(request) =>
                        mutate(
                          { action: 'request-shortage', ...target, materialId: material.id, request },
                          'Resource request created and linked to this material.',
                        )
                      }
                    />
                  </Disclosure>
                )}
                {!closed && coverage.shortage !== '0' && (
                  <Disclosure label={view.canEdit ? 'Assign a purchase' : 'Volunteer to buy'}>
                    <QuantityForm
                      label={view.canEdit ? 'Assign purchase' : 'Volunteer'}
                      busy={busy}
                      initial={coverage.shortage}
                      members={view.canEdit ? view.roster : undefined}
                      submit={(quantity, choice) =>
                        mutate(
                          {
                            action: 'assign',
                            ...target,
                            materialId: material.id,
                            assignmentId: crypto.randomUUID(),
                            memberKey: view.canEdit ? choice : self,
                            quantity,
                          },
                          'Procurement assignment saved.',
                        )
                      }
                    />
                  </Disclosure>
                )}
                {!closed && coverage.shortage !== '0' && ownStock.length > 0 && (
                  <Disclosure label="Reserve from the guild stockpile">
                    <QuantityForm
                      label="Reserve supply"
                      busy={busy}
                      initial="1"
                      stock={ownStock.map((entry) => ({
                        id: entry.id,
                        label: `${entry.material} (${amount((BigInt(entry.quantity) - BigInt(entry.reserved)).toString())} ${entry.unit} free) from ${entry.ownerName}`,
                      }))}
                      submit={(quantity, stockId) =>
                        mutate(
                          {
                            action: 'reserve',
                            ...target,
                            materialId: material.id,
                            reservationId: crypto.randomUUID(),
                            stockId,
                            quantity,
                          },
                          'Supply reserved for planning.',
                        )
                      }
                    />
                  </Disclosure>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {(project.assignments.length > 0 || project.reservations.length > 0) && (
        <section aria-label="Procurement and reservations" className="mt-5">
          <h4 className="text-sm">Procurement and reservations</h4>
          <ul className="mt-2 grid gap-2">
            {project.assignments.map((entry) => {
              const own = entry.memberKey === self;
              return (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm text-sand-200">
                  <span className="break-words">
                    {entry.memberName} buys {amount(entry.quantity)} {materialName(entry.materialId)} · {entry.status}
                  </span>
                  {(own || view.canEdit) && entry.status !== 'delivered' && (
                    <>
                      <Button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            {
                              action: 'assignment-status',
                              ...target,
                              assignmentId: entry.id,
                              status: entry.status === 'assigned' ? 'purchased' : 'assigned',
                            },
                            'Assignment updated.',
                          )
                        }
                      >
                        {entry.status === 'assigned' ? 'Mark purchased' : 'Mark not yet purchased'}
                      </Button>
                      <Button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            { action: 'assignment-remove', ...target, assignmentId: entry.id },
                            'Assignment removed.',
                          )
                        }
                      >
                        Remove assignment
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
            {project.reservations.map((entry) => {
              const stock = view.stockpile.find((item) => item.id === entry.stockId);
              const allowed = view.canEdit || entry.reservedByKey === self || stock?.ownerKey === self;
              return (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm text-sand-200">
                  <span className="break-words">
                    {amount(entry.quantity)} reserved for {materialName(entry.materialId)}: {stockLabel(entry.stockId)}
                  </span>
                  {allowed && (
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        mutate({ action: 'release', ...target, reservationId: entry.id }, 'Reservation released.')
                      }
                    >
                      Release reservation
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ContributionJournal project={project} view={view} busy={busy} closed={closed} mutate={mutate} />

      <section aria-label="Project costs" className="mt-5">
        <h4 className="text-sm">Costs</h4>
        <dl className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Stat
            label="Observed market estimate for the remaining shortage"
            value={`${amount(summary.observedEstimate)} Solari`}
          />
          <Stat label="Manually recorded costs" value={`${amount(summary.manualCosts)} Solari`} strong />
        </dl>
        <p className="mt-2 text-xs text-sand-400">
          The estimate uses the lowest observed asking prices
          {summary.estimateObservedSince && (
            <>
              {' '}
              (oldest observation <LocalTime value={summary.estimateObservedSince} />)
            </>
          )}
          ; it is not a purchase record.
          {summary.unpricedMaterials.length > 0 && ` Not priced: ${summary.unpricedMaterials.join(', ')}.`}
        </p>
        <p className="mt-2 text-xs text-sand-400">
          Confirmed deliveries:{' '}
          {summary.confirmedDeliveries.length
            ? summary.confirmedDeliveries
                .map((entry) => `${amount(entry.quantity)} ${entry.unit} ${entry.name}`)
                .join(', ')
            : 'none'}
        </p>
        {project.costs.length > 0 && (
          <ul className="mt-2 grid gap-2">
            {project.costs.map((cost) => (
              <li key={cost.id} className="flex flex-wrap items-center gap-3 text-sm text-sand-200">
                <span className="break-words">
                  {cost.label}: {amount(cost.amount)} Solari {cost.note && `· ${cost.note}`} · recorded by{' '}
                  {cost.recordedByName}
                </span>
                {view.canEdit && (
                  <Button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => mutate({ action: 'cost-delete', ...target, costId: cost.id }, 'Cost removed.')}
                  >
                    Remove cost
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {view.canEdit && (
          <Disclosure label="Record a cost">
            <CostForm
              busy={busy}
              onSubmit={(cost) => mutate({ action: 'cost-save', ...target, cost }, 'Cost recorded.')}
            />
          </Disclosure>
        )}
      </section>
    </Card>
  );
}

function ShortageForm({
  busy,
  shortage,
  unit,
  onSubmit,
}: {
  busy: boolean;
  shortage: string;
  unit: string;
  onSubmit: (request: { dropoff: string; details: string; priority: 'normal' | 'urgent' }) => void;
}) {
  const [dropoff, setDropoff] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  return (
    <form
      aria-label="Shortage resource request"
      onSubmit={(event) => {
        event.preventDefault();
        if (dropoff.trim()) onSubmit({ dropoff: dropoff.trim(), details: details.trim(), priority });
      }}
      className="grid min-w-0 grid-cols-1 gap-3"
    >
      <p className="text-sm text-sand-300">
        Creates one resource request for {amount(shortage)} {unit}. It is not created again while it stays open.
      </p>
      <Field label="Drop-off point">
        <input
          required
          maxLength={200}
          value={dropoff}
          onChange={(event) => setDropoff(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Details">
        <textarea
          rows={2}
          maxLength={1500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Priority">
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as 'normal' | 'urgent')}
          className={inputClass}
        >
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
      </Field>
      <div>
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Create resource request
        </Button>
      </div>
    </form>
  );
}

function CostForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (cost: { id: string; label: string; amount: string; note: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      aria-label="Record project cost"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim() || !solariAmountSchema.safeParse(value).success) {
          setError('Enter a label and whole Solari amount without commas.');
          return;
        }
        setError('');
        onSubmit({ id: crypto.randomUUID(), label: label.trim(), amount: value.trim(), note: note.trim() });
      }}
      className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <FormMessage error={error} />
      <Field label="Cost">
        <input
          required
          maxLength={100}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Solari">
        <input
          required
          inputMode="numeric"
          maxLength={18}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Note">
        <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>
      <div>
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Record cost
        </Button>
      </div>
    </form>
  );
}

function ContributionJournal({
  project,
  view,
  busy,
  closed,
  mutate,
}: {
  project: ProjectView;
  view: WorkspaceView;
  busy: boolean;
  closed: boolean;
  mutate: Mutate;
}) {
  const target = { id: project.id, revision: project.revision };
  const self = view.selfKey;
  const materialName = (id: string | null) =>
    id ? (project.materials.find((entry) => entry.id === id)?.name ?? 'Removed material') : 'General contribution';
  return (
    <section aria-label="Contribution journal" className="mt-5">
      <h4 className="text-sm">Contribution journal</h4>
      <p className="mt-1 text-xs text-sand-500">
        Submissions count only after another leader accepts them. Corrections keep the previous values.
      </p>
      {project.contributions.length === 0 && <p className="mt-2 text-sm text-sand-400">No contributions yet.</p>}
      <ul className="mt-2 grid gap-3">
        {project.contributions.map((entry) => (
          <ContributionRow
            key={entry.id}
            entry={entry}
            materialName={materialName(entry.materialId)}
            canReview={view.canEdit && entry.memberKey !== self && entry.status === 'submitted'}
            canCorrect={entry.memberKey === self ? entry.status !== 'accepted' : view.canEdit}
            busy={busy}
            onReview={(decision, note) =>
              mutate(
                { action: 'review', ...target, contributionId: entry.id, decision, note },
                decision === 'accepted' ? 'Contribution accepted.' : 'Contribution rejected.',
              )
            }
            onCorrect={(fields) =>
              mutate({ action: 'correct', ...target, contributionId: entry.id, ...fields }, 'Correction recorded.')
            }
          />
        ))}
      </ul>
      {!closed && (
        <Disclosure label="Submit a contribution">
          <ContributionForm
            project={project}
            view={view}
            busy={busy}
            onSubmit={(contribution) =>
              mutate({ action: 'contribute', ...target, contribution }, 'Contribution submitted for review.')
            }
          />
        </Disclosure>
      )}
    </section>
  );
}

function ContributionRow({
  entry,
  materialName,
  canReview,
  canCorrect,
  busy,
  onReview,
  onCorrect,
}: {
  entry: Contribution;
  materialName: string;
  canReview: boolean;
  canCorrect: boolean;
  busy: boolean;
  onReview: (decision: 'accepted' | 'rejected', note: string) => void;
  onCorrect: (fields: { quantity: string | null; summary: string; evidence: string; reason: string }) => void;
}) {
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(entry.quantity ?? '');
  const [summary, setSummary] = useState(entry.summary);
  const [evidence, setEvidence] = useState(entry.evidence);
  const [reason, setReason] = useState('');
  return (
    <li className="min-w-0 border border-sand-200/10 p-3 text-sm text-sand-200">
      <p className="font-mono text-xs uppercase tracking-wider text-spice-300">{entry.status}</p>
      <p className="mt-1 break-words">
        {entry.memberName}: {entry.quantity ? `${BigInt(entry.quantity).toLocaleString()} ` : ''}
        {materialName} · {entry.summary}
      </p>
      <p className="mt-1 break-words text-xs text-sand-400">
        Evidence: {entry.evidence} · submitted <LocalTime value={entry.submittedAt} />
        {entry.source && ` · linked ${entry.source.kind}`}
      </p>
      {entry.reviewedByName && (
        <p className="mt-1 break-words text-xs text-sand-400">
          Reviewed by {entry.reviewedByName}
          {entry.reviewNote && `: ${entry.reviewNote}`}
        </p>
      )}
      {entry.history.length > 0 && (
        <Disclosure label={`Correction history (${entry.history.length})`}>
          <ol className="grid gap-1 text-xs text-sand-400">
            {entry.history.map((item) => (
              <li key={item.at} className="break-words">
                <LocalTime value={item.at} /> by {item.byName}: {item.reason}. Previously{' '}
                {item.previous.quantity ?? 'no quantity'}, “{item.previous.summary}”, {item.previous.status}.
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
      {canReview && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <Field label="Review note">
            <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          <Button type="button" className="btn btn-primary" disabled={busy} onClick={() => onReview('accepted', note)}>
            Accept
          </Button>
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => onReview('rejected', note)}
          >
            Reject
          </Button>
        </div>
      )}
      {canCorrect && (
        <Disclosure label="Correct this entry">
          <form
            aria-label="Correct contribution"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason.trim() || !summary.trim() || !evidence.trim()) return;
              onCorrect({
                quantity: entry.materialId ? quantity.trim() : null,
                summary: summary.trim(),
                evidence: evidence.trim(),
                reason: reason.trim(),
              });
            }}
            className="grid min-w-0 grid-cols-1 gap-3"
          >
            {entry.materialId && (
              <Field label="Quantity">
                <input
                  required
                  inputMode="numeric"
                  maxLength={18}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
            <Field label="Summary">
              <input
                required
                maxLength={300}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Evidence">
              <input
                required
                maxLength={500}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Reason for correction">
              <input
                required
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div>
              <Button type="submit" className="btn btn-primary" disabled={busy}>
                Save correction
              </Button>
            </div>
          </form>
        </Disclosure>
      )}
    </li>
  );
}

function ContributionForm({
  project,
  view,
  busy,
  onSubmit,
}: {
  project: ProjectView;
  view: WorkspaceView;
  busy: boolean;
  onSubmit: (contribution: {
    id: string;
    materialId: string | null;
    quantity: string | null;
    summary: string;
    evidence: string;
    source: { kind: 'assignment' | 'reservation'; id: string } | null;
  }) => void;
}) {
  const [materialId, setMaterialId] = useState(project.materials[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [summary, setSummary] = useState('');
  const [evidence, setEvidence] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const self = view.selfKey;
  const sources = [
    ...project.assignments
      .filter((entry) => entry.memberKey === self && entry.materialId === materialId && entry.status !== 'delivered')
      .map((entry) => ({ value: `assignment:${entry.id}`, label: `My purchase assignment (${entry.quantity})` })),
    ...project.reservations
      .filter(
        (entry) =>
          entry.materialId === materialId &&
          view.stockpile.some((stock) => stock.id === entry.stockId && stock.ownerKey === self),
      )
      .map((entry) => ({ value: `reservation:${entry.id}`, label: `My reserved supply (${entry.quantity})` })),
  ];
  return (
    <form
      aria-label="Submit contribution"
      onSubmit={(event) => {
        event.preventDefault();
        const material = materialId || null;
        if (!summary.trim() || !evidence.trim() || (material && !projectQuantitySchema.safeParse(quantity).success)) {
          setError('Describe the contribution, its evidence and a whole quantity for materials.');
          return;
        }
        setError('');
        const [kind, id] = source.split(':') as ['assignment' | 'reservation', string];
        onSubmit({
          id: crypto.randomUUID(),
          materialId: material,
          quantity: material ? quantity.trim() : null,
          summary: summary.trim(),
          evidence: evidence.trim(),
          source: material && source ? { kind, id } : null,
        });
      }}
      className="grid min-w-0 grid-cols-1 gap-3"
    >
      <FormMessage error={error} />
      <Field label="Material">
        <select
          value={materialId}
          onChange={(event) => {
            setMaterialId(event.target.value);
            setSource('');
          }}
          className={inputClass}
        >
          {project.materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
          <option value="">General work, no material</option>
        </select>
      </Field>
      {materialId && (
        <Field label="Quantity delivered">
          <input
            required
            inputMode="numeric"
            maxLength={18}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {materialId && sources.length > 0 && (
        <Field label="Fulfils">
          <select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}>
            <option value="">Nothing planned</option>
            {sources.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Summary">
        <input
          required
          maxLength={300}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Evidence" hint="Where and when it was handed over, or a screenshot reference.">
        <input
          required
          maxLength={500}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div>
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Submit for review
        </Button>
      </div>
    </form>
  );
}
