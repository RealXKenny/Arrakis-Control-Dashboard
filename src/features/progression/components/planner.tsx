'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { CheckField, Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { StatusBadge } from '../../../components/ui/status-badge';
import { formatDecimal } from '../../../lib/format';
import {
  NOTE_LINK_PATTERN,
  PROGRESSION_LIMITS,
  buildDraftSchema,
  goalDraftSchema,
  goalKinds,
  journeyPinDraftSchema,
  noteDraftSchema,
  plannerRecordSchema,
  recipeDraftSchema,
  researchDraftSchema,
  checklistDraftSchema,
  type GoalKind,
  type PlannerCollection,
  type PlannerInput,
  type PlannerRecord,
  type StoredGoal,
} from '../model';
import { journalRecordSchema, recordingDue, JOURNAL_LIMIT, type JournalRecord } from '../journal';
import {
  buildBriefing,
  compareBuild,
  factionSeries,
  goalProgress,
  journalEntries,
  schematicObserved,
  type GoalProgress,
  type Reading,
} from '../reading';
import type { ProgressionTab } from './tabs';

export type Commitments = {
  calendar: {
    items: { id: string; category: string; title: string; startsAt: string; href: string }[];
    partial: boolean;
  } | null;
  tasks: { open: number; dueSoon: number } | null;
};

type Props = {
  tab: ProgressionTab;
  character: string;
  initialRecord: PlannerRecord;
  initialJournal: JournalRecord;
  reading: Reading;
  commitments: Commitments | null;
};
type Mutation = PlannerInput extends infer T ? (T extends unknown ? Omit<T, 'revision' | 'character'> : never) : never;

const kindLabels: Record<GoalKind, string> = {
  level: 'Character level',
  faction: 'Faction reputation',
  specialization: 'Specialization level',
  journey: 'Journey objective',
  solari: 'Solari savings',
  custom: 'Custom milestone',
};
const tone = (state: GoalProgress['state']) => (state === 'met' ? 'success' : state === 'open' ? 'warning' : 'neutral');
const stateLabel = (state: GoalProgress['state']) =>
  state === 'met' ? 'Reached' : state === 'open' ? 'In progress' : 'Unknown';
const uuid = () => crypto.randomUUID();
const h2 = 'text-base';
const muted = 'text-sm text-sand-400';
const list = 'grid gap-px bg-sand-200/10';
const row = 'bg-obsidian-900 px-4 py-3';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" className="panel grid gap-4 p-6" aria-label={title}>
      <div>
        <h2 className={h2}>{title}</h2>
        {description && <p className={`mt-1 ${muted}`}>{description}</p>}
      </div>
      {children}
    </Card>
  );
}
function Delta({ value }: { value: string | null }) {
  if (value === null) return <span className="text-sand-500">not comparable</span>;
  const positive = !value.startsWith('-') && value !== '0';
  return (
    <span className="font-mono text-spice-300">
      {positive ? '+' : ''}
      {formatDecimal(value)}
    </span>
  );
}

export function ProgressionPlanner({ tab, character, initialRecord, initialJournal, reading, commitments }: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [journal, setJournal] = useState(initialJournal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | null>(null);
  // The briefing compares with the latest observation saved before this visit, not one recorded during it.
  const [previous] = useState(() => initialJournal.snapshots.at(-1) ?? null);

  async function send<T>(url: string, body: unknown, parse: (raw: unknown) => T | null): Promise<T | null> {
    if (pending.current) return null;
    const controller = new AbortController();
    pending.current = controller;
    const deadline = setTimeout(() => controller.abort('timeout'), 15000);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = (raw as { error?: unknown } | null)?.error;
        throw new Error(
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : typeof message === 'string'
              ? message
              : 'The planner is unavailable. Reload before trying again.',
        );
      }
      const parsed = parse(raw);
      if (!parsed) throw new Error('The change could not be confirmed. Reload before trying again.');
      return parsed;
    } catch (failure) {
      setError(
        controller.signal.reason === 'timeout'
          ? 'The request timed out. Reload before trying again; your draft is kept.'
          : failure instanceof Error
            ? failure.message
            : 'The planner is unavailable.',
      );
      return null;
    } finally {
      clearTimeout(deadline);
      pending.current = null;
      setBusy(false);
    }
  }
  async function mutate(change: Mutation, done = 'Planner saved.'): Promise<boolean> {
    const next = await send('/api/v2/progression', { ...change, revision: record.revision, character }, (raw) => {
      const parsed = plannerRecordSchema.safeParse((raw as { record?: unknown } | null)?.record);
      return parsed.success && parsed.data.revision ? parsed.data : null;
    });
    if (!next) return false;
    setRecord(next);
    setStatus(done);
    return true;
  }
  async function journalAction(action: 'auto' | 'record' | 'clear') {
    const next = await send('/api/v2/progression/journal', { action, revision: journal.revision, character }, (raw) => {
      const parsed = journalRecordSchema.safeParse((raw as { journal?: unknown } | null)?.journal);
      return parsed.success
        ? { journal: parsed.data, recorded: (raw as { recorded?: unknown }).recorded === true }
        : null;
    });
    if (!next) return;
    setJournal(next.journal);
    setStatus(
      action === 'clear'
        ? 'Journal cleared.'
        : next.recorded
          ? 'Observation recorded.'
          : action === 'record'
            ? 'An observation was recorded less than 15 minutes ago. Nothing new was added.'
            : '',
    );
  }
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    if (initialRecord.tracking.enabled && recordingDue(initialJournal, Date.now(), false)) void journalAction('auto');
    // Runs once per mount; later changes are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shared = { record, reading, busy, mutate };
  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        <FormMessage error={error} status={busy ? 'Saving…' : status} />
      </div>
      <p className="text-xs text-sand-500">
        Readings observed <LocalTime value={reading.at} />. Plans are private to your dashboard account and this linked
        character.
      </p>
      {tab === 'briefing' && (
        <BriefingView
          record={record}
          reading={reading}
          previous={previous}
          journal={journal}
          commitments={commitments}
        />
      )}
      {tab === 'goals' && <GoalsView {...shared} journal={journal} />}
      {tab === 'builds' && <BuildsView {...shared} />}
      {tab === 'unlocks' && <UnlocksView {...shared} />}
      {tab === 'journey' && <JourneyView {...shared} />}
      {tab === 'journal' && (
        <JournalView record={record} journal={journal} busy={busy} mutate={mutate} act={journalAction} />
      )}
      {tab === 'notebook' && <NotebookView {...shared} />}
    </div>
  );
}

type Shared = {
  record: PlannerRecord;
  reading: Reading;
  busy: boolean;
  mutate: (change: Mutation, done?: string) => Promise<boolean>;
};

function DeleteButton({ busy, onConfirm, label }: { busy: boolean; onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="flex gap-2">
      <Button variant="danger" disabled={busy} onClick={onConfirm} aria-label={`Confirm removing ${label}`}>
        Confirm remove
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        Keep
      </Button>
    </span>
  ) : (
    <Button variant="ghost" disabled={busy} onClick={() => setArmed(true)} aria-label={`Remove ${label}`}>
      Remove
    </Button>
  );
}
const remove = (mutate: Shared['mutate'], collection: PlannerCollection, id: string) =>
  void mutate({ action: 'delete', collection, id }, 'Entry removed.');

/* N020: return-to-game briefing */
function BriefingView({
  record,
  reading,
  previous,
  journal,
  commitments,
}: {
  record: PlannerRecord;
  reading: Reading;
  previous: JournalRecord['snapshots'][number] | null;
  journal: JournalRecord;
  commitments: Commitments | null;
}) {
  const briefing = buildBriefing(record, reading, previous);
  return (
    <>
      <Section
        title="What changed"
        description="Compared with your last recorded observation, never with invented history."
      >
        {!record.tracking.enabled && !previous ? (
          <p className={muted}>
            Start tracking in the{' '}
            <Link href="/progression?tab=journal" className="text-spice-300 underline">
              journal
            </Link>{' '}
            to see what changed next time you return.
          </p>
        ) : !briefing.changes ? (
          <p className={muted}>No earlier observation is recorded yet. Changes appear after your next visit.</p>
        ) : (
          <>
            <p className={muted}>
              Since <LocalTime value={briefing.since} />
              {journal.startedAt && (
                <>
                  {' '}
                  · tracking started <LocalTime value={journal.startedAt} variant="date" />
                </>
              )}
            </p>
            <ChangeList entry={briefing.changes} />
          </>
        )}
      </Section>
      <Section title="Outstanding goals">
        {!record.goals.length ? (
          <p className={muted}>
            No goals yet.{' '}
            <Link href="/progression?tab=goals" className="text-spice-300 underline">
              Add a goal
            </Link>
            .
          </p>
        ) : !briefing.outstandingGoals.length ? (
          <p className={muted}>Every goal is reached.</p>
        ) : (
          <ul className={list}>
            {briefing.outstandingGoals.map((goal) => (
              <li key={goal.id} className={`${row} flex flex-wrap items-center justify-between gap-3`}>
                <span className="text-sm text-sand-100">{goal.title}</span>
                <span className="flex items-center gap-3 text-xs text-sand-400">
                  {goal.progress.remaining && goal.progress.remaining !== '0' && (
                    <span className="font-mono">{formatDecimal(goal.progress.remaining)} to go</span>
                  )}
                  <StatusBadge tone={tone(goal.progress.state)}>{stateLabel(goal.progress.state)}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={muted}>
          Next-session checklist: {briefing.openChecklist} open ·{' '}
          <Link href="/progression?tab=journey" className="text-spice-300 underline">
            Open checklist
          </Link>
        </p>
      </Section>
      <Section
        title="Upcoming commitments"
        description="The next seven days from the community calendar and your tasks."
      >
        {!commitments?.calendar ? (
          <p className={muted}>Calendar commitments are unavailable right now.</p>
        ) : (
          <>
            {commitments.calendar.partial && (
              <p className="text-xs text-status-warn">
                Some calendar sources are unavailable, so this list may be incomplete.
              </p>
            )}
            {!commitments.calendar.items.length ? (
              <p className={muted}>No events, operations or restarts in the next seven days.</p>
            ) : (
              <ul className={list}>
                {commitments.calendar.items.map((item) => (
                  <li key={item.id} className={`${row} flex flex-wrap items-center justify-between gap-3`}>
                    <Link href={item.href} className="text-sm text-sand-100 underline-offset-2 hover:underline">
                      {item.title}
                    </Link>
                    <span className="text-xs text-sand-400">
                      {item.category} · <LocalTime value={item.startsAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className={muted}>
          {commitments?.tasks
            ? `${commitments.tasks.open} open personal tasks, ${commitments.tasks.dueSoon} due within seven days.`
            : 'Personal tasks are unavailable right now.'}{' '}
          <Link href="/tasks" className="text-spice-300 underline">
            Personal tasks
          </Link>
        </p>
      </Section>
    </>
  );
}
function ChangeList({ entry }: { entry: ReturnType<typeof journalEntries>[number] }) {
  return (
    <>
      {!entry.changes.length ? (
        <p className={muted}>No observed changes.</p>
      ) : (
        <ul className={list}>
          {entry.changes.map((change) => (
            <li key={change.label} className={`${row} flex flex-wrap items-center justify-between gap-3 text-sm`}>
              <span className="text-sand-100">{change.label}</span>
              {change.from !== null && (
                <span className="text-xs text-sand-400">
                  <span className="font-mono">{formatDecimal(change.from)}</span> →{' '}
                  <span className="font-mono">{formatDecimal(change.to)}</span> (<Delta value={change.delta} />)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {entry.unobserved.length > 0 && (
        <p className="text-xs text-sand-500">Not comparable (missing in one reading): {entry.unobserved.join(', ')}.</p>
      )}
    </>
  );
}

/* N011, N016, N017: goal board, faction targets and Solari savings */
type GoalForm = Omit<StoredGoal, 'createdAt' | 'updatedAt'>;
const blankGoal = (kind: GoalKind = 'level'): GoalForm => ({
  id: uuid(),
  kind,
  title: '',
  ref: '',
  target: '',
  balance: kind === 'solari' ? 'credit' : null,
  pinned: false,
  done: false,
  note: '',
});
function GoalsView({ record, reading, busy, mutate, journal }: Shared & { journal: JournalRecord }) {
  const [draft, setDraft] = useState<GoalForm | null>(null);
  const [problem, setProblem] = useState('');
  const options =
    draft?.kind === 'faction'
      ? (reading.factions ?? []).map((entry) => entry.name)
      : draft?.kind === 'specialization'
        ? (reading.specs ?? []).map((entry) => entry.name)
        : draft?.kind === 'journey'
          ? (reading.journeyNodes ?? []).filter((node) => !node.complete).map((node) => node.id)
          : [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const parsed = goalDraftSchema.safeParse(draft);
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? 'Check the goal fields.');
    setProblem('');
    if (await mutate({ action: 'save-goal', item: parsed.data }, 'Goal saved.')) setDraft(null);
  }
  const groups: [string, string, StoredGoal[]][] = [
    [
      'Milestones',
      'Level, specialization, journey and custom milestones.',
      record.goals.filter((g) => !['faction', 'solari'].includes(g.kind)),
    ],
    [
      'Faction targets',
      'Reputation targets with bounded observed history from your journal. Earlier values are not inferred.',
      record.goals.filter((g) => g.kind === 'faction'),
    ],
    [
      'Solari savings',
      'Compared with read-only game balances. The dashboard never moves, reserves or spends Solari.',
      record.goals.filter((g) => g.kind === 'solari'),
    ],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy || Boolean(draft)} onClick={() => setDraft(blankGoal())}>
          New goal
        </Button>
        <p className={muted}>
          {record.goals.length}/{PROGRESSION_LIMITS.goals} goals · {record.goals.filter((g) => g.pinned).length}/
          {PROGRESSION_LIMITS.pinnedGoals} pinned to the portal
        </p>
      </div>
      {draft && (
        <Section title={record.goals.some((g) => g.id === draft.id) ? 'Edit goal' : 'New goal'}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit} aria-label="Goal editor">
            <Field label="Kind">
              <select
                className={inputClass}
                value={draft.kind}
                onChange={(event) => {
                  const kind = event.target.value as GoalKind;
                  setDraft({
                    ...blankGoal(kind),
                    id: draft.id,
                    title: draft.title,
                    note: draft.note,
                    pinned: draft.pinned,
                  });
                }}
              >
                {goalKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                className={inputClass}
                required
                maxLength={80}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            {['faction', 'specialization', 'journey'].includes(draft.kind) && (
              <Field
                label={
                  draft.kind === 'journey'
                    ? 'Journey objective ID'
                    : draft.kind === 'faction'
                      ? 'Faction'
                      : 'Specialization'
                }
                hint={
                  options.length
                    ? 'Suggestions come from your current reading.'
                    : 'No current reading; enter the exact name.'
                }
              >
                <input
                  className={inputClass}
                  list="goal-ref-options"
                  required
                  maxLength={128}
                  value={draft.ref}
                  onChange={(e) => setDraft({ ...draft, ref: e.target.value })}
                />
                <datalist id="goal-ref-options">
                  {options.slice(0, 200).map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </Field>
            )}
            {!['journey', 'custom'].includes(draft.kind) && (
              <Field label="Target" hint="Whole number.">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  required
                  pattern="0|[1-9][0-9]{0,29}"
                  value={draft.target}
                  onChange={(e) => setDraft({ ...draft, target: e.target.value.trim() })}
                />
              </Field>
            )}
            {draft.kind === 'solari' && (
              <Field label="Balance">
                <select
                  className={inputClass}
                  value={draft.balance ?? 'credit'}
                  onChange={(e) => setDraft({ ...draft, balance: e.target.value as 'credit' | 'pocket' })}
                >
                  <option value="credit">Solari credit</option>
                  <option value="pocket">Pocket Solari</option>
                </select>
              </Field>
            )}
            <Field label="Note">
              <textarea
                className={inputClass}
                maxLength={500}
                rows={2}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </Field>
            <div className="grid content-start gap-3">
              <CheckField
                label="Pin to the portal"
                checked={draft.pinned}
                onChange={(pinned) => setDraft({ ...draft, pinned })}
              />
              {draft.kind === 'custom' && (
                <CheckField label="Done" checked={draft.done} onChange={(done) => setDraft({ ...draft, done })} />
              )}
            </div>
            {problem && (
              <p role="alert" className="text-sm text-status-danger md:col-span-2">
                {problem}
              </p>
            )}
            <div className="flex gap-3 md:col-span-2">
              <Button type="submit" variant="primary" disabled={busy}>
                Save goal
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      )}
      {groups.map(([title, description, goals]) => (
        <Section key={title} title={title} description={description}>
          {!goals.length ? (
            <p className={muted}>None yet.</p>
          ) : (
            <ul className={list}>
              {goals.map((goal) => {
                const progress = goalProgress(goal, reading);
                const series = goal.kind === 'faction' ? factionSeries(journal.snapshots, goal.ref) : [];
                return (
                  <li key={goal.id} className={`${row} grid gap-2`} id={`goal-${goal.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong className="text-sm text-sand-50">{goal.title}</strong>
                      <span className="flex items-center gap-2">
                        {goal.pinned && <StatusBadge>Pinned</StatusBadge>}
                        <StatusBadge tone={tone(progress.state)}>{stateLabel(progress.state)}</StatusBadge>
                      </span>
                    </div>
                    <p className="text-xs text-sand-400">
                      {kindLabels[goal.kind]}
                      {goal.ref && ` · ${goal.ref}`}
                      {progress.target && (
                        <>
                          {' · '}
                          <span className="font-mono">
                            {progress.current === null ? 'unknown' : formatDecimal(progress.current)} /{' '}
                            {formatDecimal(progress.target)}
                          </span>
                          {progress.remaining &&
                            progress.remaining !== '0' &&
                            ` · ${formatDecimal(progress.remaining)} to go`}
                        </>
                      )}{' '}
                      · {progress.detail}
                    </p>
                    {series.length > 0 && (
                      <ol
                        className="flex flex-wrap gap-2 text-xs text-sand-400"
                        aria-label={`${goal.ref} observed history`}
                      >
                        {series.map((point) => (
                          <li key={point.at} className="border border-sand-200/15 px-2 py-1">
                            <LocalTime value={point.at} variant="date" />:{' '}
                            <span className="font-mono">
                              {point.value === null ? 'unknown' : formatDecimal(point.value)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {goal.note && <p className="whitespace-pre-wrap text-sm text-sand-300">{goal.note}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={busy || Boolean(draft)}
                        onClick={() =>
                          setDraft({
                            id: goal.id,
                            kind: goal.kind,
                            title: goal.title,
                            ref: goal.ref,
                            target: goal.target,
                            balance: goal.balance,
                            pinned: goal.pinned,
                            done: goal.done,
                            note: goal.note,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            { action: 'save-goal', item: { ...pickGoal(goal), pinned: !goal.pinned } },
                            goal.pinned ? 'Goal unpinned.' : 'Goal pinned to the portal.',
                          )
                        }
                      >
                        {goal.pinned ? 'Unpin' : 'Pin to portal'}
                      </Button>
                      <DeleteButton busy={busy} label={goal.title} onConfirm={() => remove(mutate, 'goals', goal.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      ))}
    </>
  );
}
function pickGoal(goal: StoredGoal) {
  const { createdAt: _created, updatedAt: _updated, ...draft } = goal;
  return draft;
}

/* N013: saved skill-build planner */
function BuildsView({ record, reading, busy, mutate }: Shared) {
  const [draft, setDraft] = useState<{ id: string; name: string; purpose: string; targets: string } | null>(null);
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const targets = draft.targets
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^(.+?)\s*[:=]\s*(\d{1,3})$/.exec(line);
        return match ? { track: match[1].trim(), level: Number(match[2]) } : { track: line, level: -1 };
      });
    const parsed = buildDraftSchema.safeParse({ id: draft.id, name: draft.name, purpose: draft.purpose, targets });
    if (!parsed.success)
      return setProblem('Enter a name and one "Specialization: level" line per track (up to 12, each listed once).');
    setProblem('');
    if (await mutate({ action: 'save-build', item: parsed.data }, 'Skill build saved.')) setDraft(null);
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || Boolean(draft)}
          onClick={() => setDraft({ id: uuid(), name: '', purpose: '', targets: '' })}
        >
          New skill build
        </Button>
        <p className={muted}>
          {record.builds.length}/{PROGRESSION_LIMITS.builds} builds · Unspent skill points:{' '}
          <span className="font-mono">
            {reading.unspentSkillPoints === null ? 'unknown' : formatDecimal(reading.unspentSkillPoints)}
          </span>
        </p>
      </div>
      <Section title="Current verified ranks" description="Specialization levels as currently reported by the Console.">
        {!reading.specs ? (
          <p className={muted}>Specialization readings are unavailable.</p>
        ) : !reading.specs.length ? (
          <p className={muted}>No specializations reported.</p>
        ) : (
          <ul className={list}>
            {reading.specs.map((spec) => (
              <li key={spec.name} className={`${row} flex justify-between text-sm`}>
                <span className="text-sand-100">{spec.name}</span>
                <span className="font-mono text-spice-300">
                  {spec.value === null ? 'unknown' : formatDecimal(spec.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {draft && (
        <Section title="Skill build">
          <form className="grid gap-4" onSubmit={submit} aria-label="Skill build editor">
            <Field label="Name">
              <input
                className={inputClass}
                required
                maxLength={60}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Purpose">
              <input
                className={inputClass}
                maxLength={300}
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
              />
            </Field>
            <Field label="Planned levels" hint='One per line, for example "Trooper: 8".'>
              <textarea
                className={inputClass}
                rows={5}
                required
                value={draft.targets}
                onChange={(e) => setDraft({ ...draft, targets: e.target.value })}
              />
            </Field>
            {problem && (
              <p role="alert" className="text-sm text-status-danger">
                {problem}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" variant="primary" disabled={busy}>
                Save build
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      )}
      {record.builds.map((build) => (
        <Section key={build.id} title={build.name} description={build.purpose || undefined}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-sand-500">
              <tr>
                <th className="py-2">Specialization</th>
                <th>Planned</th>
                <th>Current</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {compareBuild(build, reading).map((entry) => (
                <tr key={entry.track} className="border-t border-sand-200/10">
                  <td className="py-2 text-sand-100">{entry.track}</td>
                  <td className="font-mono">{entry.planned}</td>
                  <td className="font-mono">{entry.current === null ? 'unknown' : formatDecimal(entry.current)}</td>
                  <td className="font-mono">
                    {entry.gap === null ? 'unknown' : BigInt(entry.gap) <= 0n ? 'reached' : formatDecimal(entry.gap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy || Boolean(draft)}
              onClick={() =>
                setDraft({
                  id: build.id,
                  name: build.name,
                  purpose: build.purpose,
                  targets: build.targets.map((t) => `${t.track}: ${t.level}`).join('\n'),
                })
              }
            >
              Edit
            </Button>
            <DeleteButton busy={busy} label={build.name} onConfirm={() => remove(mutate, 'builds', build.id)} />
          </div>
        </Section>
      ))}
    </>
  );
}

/* N012 research wishlist and N014 recipe-unlock checklist */
function UnlocksView({ record, reading, busy, mutate }: Shared) {
  const [research, setResearch] = useState({ name: '', priority: 'normal' as 'high' | 'normal' | 'low' });
  const [recipe, setRecipe] = useState({ name: '', materials: '' });
  const order = { high: 0, normal: 1, low: 2 } as const;
  const pursuing = record.research
    .filter((entry) => entry.status !== 'unlocked')
    .sort((a, b) => order[a.priority] - order[b.priority] || a.createdAt.localeCompare(b.createdAt));
  const unlocked = record.research.filter((entry) => entry.status === 'unlocked');
  async function addResearch(event: FormEvent) {
    event.preventDefault();
    const parsed = researchDraftSchema.safeParse({ id: uuid(), ...research, status: 'wanted', note: '' });
    if (parsed.success && (await mutate({ action: 'save-research', item: parsed.data }, 'Research added.')))
      setResearch({ name: '', priority: 'normal' });
  }
  async function addRecipe(event: FormEvent) {
    event.preventDefault();
    const parsed = recipeDraftSchema.safeParse({ id: uuid(), ...recipe, acquired: false, note: '' });
    if (parsed.success && (await mutate({ action: 'save-recipe', item: parsed.data }, 'Recipe added.')))
      setRecipe({ name: '', materials: '' });
  }
  const strip = <T extends { createdAt: string; updatedAt: string }>({ createdAt: _c, updatedAt: _u, ...rest }: T) =>
    rest;
  return (
    <>
      <Section
        title="Research wishlist"
        description="The Console does not report research progress. Statuses here are your own records, kept separate from game data."
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={addResearch} aria-label="Add research">
          <Field label="Research">
            <input
              className={inputClass}
              required
              maxLength={80}
              value={research.name}
              onChange={(e) => setResearch({ ...research, name: e.target.value })}
            />
          </Field>
          <Field label="Priority">
            <select
              className={inputClass}
              value={research.priority}
              onChange={(e) => setResearch({ ...research, priority: e.target.value as 'high' })}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || record.research.length >= PROGRESSION_LIMITS.research}
          >
            Add
          </Button>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['Next to pursue', pursuing],
              ['Unlocked (self-reported)', unlocked],
            ] as const
          ).map(([title, entries]) => (
            <div key={title}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-sand-300">{title}</h3>
              {!entries.length ? (
                <p className={muted}>None.</p>
              ) : (
                <ul className={list}>
                  {entries.map((entry) => (
                    <li key={entry.id} className={`${row} grid gap-2`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-sand-100">{entry.name}</span>
                        <span className="text-xs text-sand-400">
                          {entry.status === 'in-progress' ? 'In progress · ' : ''}
                          {entry.priority} priority
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`Status of ${entry.name}`}
                          className={`${inputClass} w-auto`}
                          disabled={busy}
                          value={entry.status}
                          onChange={(e) =>
                            void mutate({
                              action: 'save-research',
                              item: { ...strip(entry), status: e.target.value as 'wanted' },
                            })
                          }
                        >
                          <option value="wanted">Wanted</option>
                          <option value="in-progress">In progress</option>
                          <option value="unlocked">Unlocked</option>
                        </select>
                        <DeleteButton
                          busy={busy}
                          label={entry.name}
                          onConfirm={() => remove(mutate, 'research', entry.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Recipe-unlock checklist"
        description="Tick recipes you have acquired. A held schematic with the exact same name is shown as an observation only; it does not prove the recipe is unlocked."
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={addRecipe} aria-label="Add recipe">
          <Field label="Recipe">
            <input
              className={inputClass}
              required
              maxLength={80}
              value={recipe.name}
              onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
            />
          </Field>
          <Field label="Materials or source">
            <input
              className={inputClass}
              maxLength={300}
              value={recipe.materials}
              onChange={(e) => setRecipe({ ...recipe, materials: e.target.value })}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || record.recipes.length >= PROGRESSION_LIMITS.recipes}
          >
            Add
          </Button>
        </form>
        {!record.recipes.length ? (
          <p className={muted}>No recipes yet.</p>
        ) : (
          <ul className={list}>
            {record.recipes.map((entry) => {
              const observed = schematicObserved(entry.name, reading);
              return (
                <li key={entry.id} className={`${row} flex flex-wrap items-center justify-between gap-3`}>
                  <span className="grid gap-1">
                    <CheckField
                      label={entry.name}
                      checked={entry.acquired}
                      onChange={(acquired) =>
                        void mutate({ action: 'save-recipe', item: { ...strip(entry), acquired } })
                      }
                    />
                    {entry.materials && <small className="text-xs text-sand-400">{entry.materials}</small>}
                    <small className="text-xs text-sand-500">
                      {observed === null
                        ? 'Schematic readings unavailable.'
                        : observed
                          ? 'Matching schematic observed in your inventory.'
                          : 'No matching schematic observed.'}
                    </small>
                  </span>
                  <DeleteButton busy={busy} label={entry.name} onConfirm={() => remove(mutate, 'recipes', entry.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

/* N015: pinned journey objectives and next-session checklist */
function JourneyView({ record, reading, busy, mutate }: Shared) {
  const [pin, setPin] = useState({ nodeId: '', note: '' });
  const [item, setItem] = useState('');
  const incomplete = (reading.journeyNodes ?? []).filter((node) => !node.complete);
  async function addPin(event: FormEvent) {
    event.preventDefault();
    const parsed = journeyPinDraftSchema.safeParse({ id: uuid(), ...pin });
    if (parsed.success && (await mutate({ action: 'save-journey-pin', item: parsed.data }, 'Objective pinned.')))
      setPin({ nodeId: '', note: '' });
  }
  async function addItem(event: FormEvent) {
    event.preventDefault();
    const parsed = checklistDraftSchema.safeParse({ id: uuid(), text: item, done: false });
    if (parsed.success && (await mutate({ action: 'save-checklist', item: parsed.data }, 'Checklist updated.')))
      setItem('');
  }
  return (
    <>
      <Section
        title="Pinned journey objectives"
        description="Completion comes from the Console journey reading. Notes are yours."
      >
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
          onSubmit={addPin}
          aria-label="Pin a journey objective"
        >
          <Field
            label="Objective ID"
            hint={
              reading.journeyNodes
                ? `${incomplete.length} incomplete objectives reported.`
                : 'Journey readings unavailable.'
            }
          >
            <input
              className={inputClass}
              list="journey-options"
              required
              maxLength={128}
              value={pin.nodeId}
              onChange={(e) => setPin({ ...pin, nodeId: e.target.value })}
            />
            <datalist id="journey-options">
              {incomplete.slice(0, 300).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.group}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Note">
            <input
              className={inputClass}
              maxLength={500}
              value={pin.note}
              onChange={(e) => setPin({ ...pin, note: e.target.value })}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || record.journeyPins.length >= PROGRESSION_LIMITS.journeyPins}
          >
            Pin
          </Button>
        </form>
        {reading.journeyLimited && (
          <p className="text-xs text-status-warn">The journey reading was bounded; some objectives may be missing.</p>
        )}
        {!record.journeyPins.length ? (
          <p className={muted}>No pinned objectives.</p>
        ) : (
          <ul className={list}>
            {record.journeyPins.map((entry) => {
              const node = reading.journeyNodes?.find((candidate) => candidate.id === entry.nodeId);
              const state = !reading.journeyNodes || !node ? 'unknown' : node.complete ? 'met' : 'open';
              return (
                <li key={entry.id} className={`${row} grid gap-2`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all font-mono text-xs text-sand-100">{entry.nodeId}</span>
                    <StatusBadge tone={tone(state)}>
                      {state === 'met' ? 'Complete' : state === 'open' ? 'Not complete' : 'Not reported'}
                    </StatusBadge>
                  </div>
                  {entry.note && <p className="whitespace-pre-wrap text-sm text-sand-300">{entry.note}</p>}
                  <div>
                    <DeleteButton
                      busy={busy}
                      label={entry.nodeId}
                      onConfirm={() => remove(mutate, 'journeyPins', entry.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section
        title="Next-session checklist"
        description="Things to do next time you play. Ticking an item never performs a game action."
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={addItem} aria-label="Add checklist item">
          <Field label="Item">
            <input
              className={inputClass}
              required
              maxLength={160}
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || record.checklist.length >= PROGRESSION_LIMITS.checklist}
          >
            Add
          </Button>
        </form>
        {!record.checklist.length ? (
          <p className={muted}>Nothing planned yet.</p>
        ) : (
          <ul className={list}>
            {record.checklist.map((entry) => (
              <li key={entry.id} className={`${row} flex items-center justify-between gap-3`}>
                <CheckField
                  label={entry.text}
                  checked={entry.done}
                  onChange={(done) =>
                    void mutate({ action: 'save-checklist', item: { id: entry.id, text: entry.text, done } })
                  }
                />
                <DeleteButton busy={busy} label={entry.text} onConfirm={() => remove(mutate, 'checklist', entry.id)} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* N018: progression journal */
function JournalView({
  record,
  journal,
  busy,
  mutate,
  act,
}: {
  record: PlannerRecord;
  journal: JournalRecord;
  busy: boolean;
  mutate: Shared['mutate'];
  act: (action: 'record' | 'clear') => Promise<void>;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const entries = journalEntries(journal.snapshots);
  const oldest = journal.snapshots[0];
  return (
    <Section
      title="Progression journal"
      description={`Changes between observations recorded after tracking starts. Opening the planner records at most one observation every six hours; up to ${JOURNAL_LIMIT} are kept. Nothing before the first observation is claimed.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={record.tracking.enabled ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={() =>
            void mutate(
              { action: 'set-tracking', enabled: !record.tracking.enabled },
              record.tracking.enabled ? 'Tracking paused.' : 'Tracking started.',
            )
          }
        >
          {record.tracking.enabled ? 'Pause tracking' : 'Start tracking'}
        </Button>
        <Button variant="secondary" disabled={busy || !record.tracking.enabled} onClick={() => void act('record')}>
          Record now
        </Button>
        {confirmClear ? (
          <>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void act('clear').then(() => setConfirmClear(false))}
            >
              Confirm clear journal
            </Button>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy || !journal.snapshots.length} onClick={() => setConfirmClear(true)}>
            Clear journal
          </Button>
        )}
      </div>
      <p className={muted}>
        {record.tracking.enabled ? 'Tracking is on.' : 'Tracking is paused.'} {journal.snapshots.length}/{JOURNAL_LIMIT}{' '}
        observations kept.
        {oldest && (
          <>
            {' '}
            Baseline: <LocalTime value={oldest.at} />.
          </>
        )}
      </p>
      {!entries.length ? (
        <p className={muted}>
          {journal.snapshots.length
            ? 'Baseline recorded. Changes appear after the next observation.'
            : 'No observations yet.'}
        </p>
      ) : (
        <ol className="grid gap-4">
          {entries.map((entry) => (
            <li key={entry.to} className="grid gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-sand-300">
                <LocalTime value={entry.from} /> → <LocalTime value={entry.to} />
              </h3>
              <ChangeList entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/* N019: private notebook */
type NoteForm = { id: string; title: string; body: string; tags: string; links: string };
function NotebookView({ record, busy, mutate }: Shared) {
  const [draft, setDraft] = useState<NoteForm | null>(null);
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const links = draft.links
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split('|');
        return { label: label.trim(), href: rest.join('|').trim() };
      });
    const parsed = noteDraftSchema.safeParse({
      id: draft.id,
      title: draft.title,
      body: draft.body,
      tags: draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      links,
    });
    if (!parsed.success)
      return setProblem(
        'Check the title, up to 5 tags (letters, numbers, spaces, - or _) and up to 5 links written as "Label | /holdings".',
      );
    setProblem('');
    if (await mutate({ action: 'save-note', item: parsed.data }, 'Note saved.')) setDraft(null);
  }
  const needle = search.trim().toLowerCase();
  const notes = record.notes
    .filter((note) => !needle || `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant="primary"
          disabled={busy || Boolean(draft)}
          onClick={() => setDraft({ id: uuid(), title: '', body: '', tags: '', links: '' })}
        >
          New note
        </Button>
        <Field label="Search notes">
          <input className={inputClass} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <p className={muted}>
          {record.notes.length}/{PROGRESSION_LIMITS.notes} notes
        </p>
      </div>
      <p className="text-xs text-sand-500">
        Links stay inside this dashboard. Opening one rechecks your access; a saved link never grants it.
      </p>
      {draft && (
        <Section title="Note">
          <form className="grid gap-4" onSubmit={submit} aria-label="Note editor">
            <Field label="Title">
              <input
                className={inputClass}
                required
                maxLength={100}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Note">
              <textarea
                className={inputClass}
                rows={8}
                maxLength={4000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Comma-separated, up to 5.">
              <input
                className={inputClass}
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </Field>
            <Field label="Links to your assets" hint='One per line, for example "Main base | /holdings?view=owned".'>
              <textarea
                className={inputClass}
                rows={3}
                value={draft.links}
                onChange={(e) => setDraft({ ...draft, links: e.target.value })}
              />
            </Field>
            {problem && (
              <p role="alert" className="text-sm text-status-danger">
                {problem}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" variant="primary" disabled={busy}>
                Save note
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      )}
      {!notes.length ? (
        <p className={muted}>{record.notes.length ? 'No notes match.' : 'No notes yet.'}</p>
      ) : (
        notes.map((note) => (
          <Section key={note.id} title={note.title}>
            {note.tags.length > 0 && (
              <p className="text-xs text-sand-400">{note.tags.map((tag) => `#${tag}`).join(' ')}</p>
            )}
            {note.body && <p className="whitespace-pre-wrap text-sm text-sand-200">{note.body}</p>}
            {note.links.length > 0 && (
              <ul className="flex flex-wrap gap-3 text-sm">
                {note.links
                  .filter((link) => NOTE_LINK_PATTERN.test(link.href))
                  .map((link) => (
                    <li key={`${link.label}${link.href}`}>
                      <Link href={link.href} prefetch={false} className="text-spice-300 underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
            <p className="text-xs text-sand-500">
              Updated <LocalTime value={note.updatedAt} />
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={busy || Boolean(draft)}
                onClick={() =>
                  setDraft({
                    id: note.id,
                    title: note.title,
                    body: note.body,
                    tags: note.tags.join(', '),
                    links: note.links.map((link) => `${link.label} | ${link.href}`).join('\n'),
                  })
                }
              >
                Edit
              </Button>
              <DeleteButton busy={busy} label={note.title} onConfirm={() => remove(mutate, 'notes', note.id)} />
            </div>
          </Section>
        ))
      )}
    </>
  );
}
