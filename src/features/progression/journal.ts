import { z } from 'zod';
import { snapshotSchema, type Snapshot } from './reading';

/** Server-recorded observation snapshots (N016/N018). Browser-safe schema and recording policy. */
export const JOURNAL_LIMIT = 40;
/** Opening the planner records at most one automatic observation per window. */
const AUTOMATIC_INTERVAL_MS = 6 * 3600_000;
/** A manual "Record now" still waits this long so repeated clicks cannot flood the bounded history. */
const MANUAL_INTERVAL_MS = 15 * 60_000;

export const journalRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.uuid().nullable(),
    startedAt: z.iso.datetime().nullable(),
    snapshots: z.array(snapshotSchema).max(JOURNAL_LIMIT),
  })
  .strict()
  .refine((journal) => journal.snapshots.every((s, i, all) => i === 0 || all[i - 1].at < s.at), {
    message: 'Snapshots must be in time order.',
  });
export type JournalRecord = z.infer<typeof journalRecordSchema>;
export const emptyJournal = (): JournalRecord => ({ schemaVersion: 1, revision: null, startedAt: null, snapshots: [] });

export function recordingDue(journal: JournalRecord, now: number, manual: boolean): boolean {
  const last = journal.snapshots.at(-1);
  if (!last) return true;
  return now - Date.parse(last.at) >= (manual ? MANUAL_INTERVAL_MS : AUTOMATIC_INTERVAL_MS);
}
/** Appends one observation and drops the oldest beyond the bound; the earliest kept one becomes the baseline. */
export function appendSnapshot(journal: JournalRecord, snapshot: Snapshot): JournalRecord {
  const last = journal.snapshots.at(-1);
  if (last && last.at >= snapshot.at) return journal;
  return {
    ...journal,
    startedAt: journal.startedAt ?? snapshot.at,
    snapshots: [...journal.snapshots, snapshot].slice(-JOURNAL_LIMIT),
  };
}
