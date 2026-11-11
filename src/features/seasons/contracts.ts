import { z } from 'zod';

export const paths = ['solo', 'builder', 'explorer', 'supplier', 'mentor'] as const;
export const cosmeticKinds = ['badge', 'banner', 'title', 'decoration', 'achievement'] as const;
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
export const rewardSchema = z.object({
  id: identifier,
  name: text(100),
  description: text(600),
  level: z.number().int().min(1).max(100),
  kind: z.enum(cosmeticKinds),
  motif: z.enum(['dune', 'star', 'spire', 'sun', 'wing']),
  color: z.enum(['sand', 'spice', 'blue']),
});
export const challengeSchema = z.object({
  id: identifier,
  name: text(100),
  description: text(1200),
  path: z.enum(paths),
  cadence: z.enum(['daily', 'weekly', 'seasonal', 'once', 'event']),
  verification: z.enum(['review', 'linked-character']),
  xp: z.number().int().min(1).max(100000),
  limit: z.number().int().min(1).max(20),
});
export const milestoneSchema = z.object({
  id: identifier,
  name: text(100),
  description: text(600),
  target: z.number().int().min(1).max(100000000),
});
export const definitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    name: text(100),
    subtitle: text(160),
    description: text(3000),
    number: z.number().int().min(1).max(100000),
    theme: z.enum(['dunes', 'eclipse', 'spice']),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timezone: text(80).refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Use an IANA timezone.'),
    thresholds: z.array(z.number().int().min(0).max(10000000)).min(2).max(100),
    rewards: z.array(rewardSchema).min(1).max(100),
    challenges: z.array(challengeSchema).min(1).max(100),
    milestones: z.array(milestoneSchema).max(20),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) issue('End must follow start.');
    if (Date.parse(value.endsAt) - Date.parse(value.startsAt) > 366 * 86400000)
      issue('A season may last at most 366 days.');
    if (value.thresholds[0] !== 0 || value.thresholds.some((v, i) => i > 0 && v <= value.thresholds[i - 1]))
      issue('Thresholds must start at zero and strictly increase.');
    for (const list of [value.rewards, value.challenges, value.milestones])
      if (new Set(list.map((v) => v.id)).size !== list.length) issue('IDs must be unique within each list.');
    if (value.rewards.some((v) => v.level > value.thresholds.length)) issue('Reward level exceeds the level cap.');
    if (value.challenges.some((v) => v.verification === 'linked-character' && (v.cadence !== 'once' || v.limit !== 1)))
      issue('Linked-character verification is one-time only.');
    if (value.challenges.some((v) => ['once', 'seasonal', 'event'].includes(v.cadence) && v.limit !== 1))
      issue('Non-recurring challenges have one completion.');
  });
export type Definition = z.infer<typeof definitionSchema>;
export type Reward = z.infer<typeof rewardSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Season = {
  id: string;
  revision: string;
  phase: 'draft' | 'preview' | 'published' | 'ended' | 'archived';
  definition: Definition;
  createdAt: string;
  publishedAt?: string;
  endedAt?: string;
};
export type Submission = {
  id: string;
  challengeId: string;
  owner: string;
  period: string;
  text: string;
  links: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  note?: string;
};
export type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  at: string;
  actor: string;
  submissionId?: string;
};
export type Claim = { reward: Reward; at: string };
export type Progress = {
  xp: number;
  ledger: LedgerEntry[];
  submissions: Submission[];
  claims: Claim[];
  equipped: Partial<Record<Reward['kind'], string>>;
};
export type Totals = {
  participants: number;
  completions: number;
  xp: number;
  claims: number;
  levels?: Record<string, number>;
  challenges?: Record<string, number>;
  rewards?: Record<string, number>;
  milestones?: Record<string, string>;
};
export type Delivery = {
  id: string;
  owner: string;
  description: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
};
export const seasonRecordSchema = z.object({
  id: identifier,
  revision: z.string().uuid(),
  phase: z.enum(['draft', 'preview', 'published', 'ended', 'archived']),
  definition: definitionSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
});
export const progressRecordSchema = z
  .object({
    xp: z.number().int().min(0).max(100000000),
    ledger: z
      .array(
        z.object({
          id: z.string().uuid(),
          delta: z.number().int().min(-100000).max(100000),
          reason: z.string().max(1200),
          at: z.iso.datetime(),
          actor: z.string().min(1).max(100),
          submissionId: z.string().uuid().optional(),
        }),
      )
      .max(1250),
    submissions: z
      .array(
        z.object({
          id: z.string().uuid(),
          challengeId: identifier,
          owner: identifier,
          period: z.string().min(1).max(10),
          text: z.string().max(2000),
          links: z.array(z.string().url().max(500)).max(3),
          status: z.enum(['pending', 'approved', 'rejected']),
          submittedAt: z.iso.datetime(),
          reviewedAt: z.iso.datetime().optional(),
          reviewer: z.string().max(100).optional(),
          note: z.string().max(1000).optional(),
        }),
      )
      .max(1200),
    claims: z.array(z.object({ reward: rewardSchema, at: z.iso.datetime() })).max(100),
    equipped: z.partialRecord(z.enum(cosmeticKinds), identifier),
  })
  .superRefine((record, ctx) => {
    if (
      record.ledger.reduce((sum, entry) => sum + entry.delta, 0) !== record.xp ||
      new Set(record.ledger.map((v) => v.id)).size !== record.ledger.length ||
      new Set(record.submissions.map((v) => v.id)).size !== record.submissions.length ||
      new Set(record.claims.map((v) => v.reward.id)).size !== record.claims.length
    )
      ctx.addIssue({ code: 'custom', message: 'Corrupt progression history.' });
  });
export const totalsRecordSchema = z.object({
  participants: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  completions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  xp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  claims: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export const emptyProgress = (): Progress => ({ xp: 0, ledger: [], submissions: [], claims: [], equipped: {} });
export const emptyTotals = (): Totals => ({ participants: 0, completions: 0, xp: 0, claims: 0 });

export function seasonState(season: Season, now = Date.now()) {
  if (season.phase !== 'published') return season.phase;
  if (now >= Date.parse(season.definition.endsAt)) return 'ended';
  return now < Date.parse(season.definition.startsAt) ? 'scheduled' : 'active';
}
export function levelProgress(definition: Definition, xp: number) {
  let index = 0;
  while (index + 1 < definition.thresholds.length && xp >= definition.thresholds[index + 1]) index++;
  const floor = definition.thresholds[index];
  const next = definition.thresholds[index + 1] ?? null;
  return {
    level: index + 1,
    floor,
    next,
    fraction: next === null ? 1 : Math.max(0, Math.min(1, (xp - floor) / (next - floor))),
  };
}
/** Recurrences use the configured calendar zone; ISO weeks start Monday, including across DST. */
export function periodFor(challenge: Challenge, definition: Definition, now: number): string {
  if (!['daily', 'weekly'].includes(challenge.cadence)) return 'season';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: definition.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((v) => v.type === type)!.value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  if (challenge.cadence === 'weekly') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function periodCount(definition: Definition, challenge: Challenge, cache: Map<string, number>) {
  if (!['daily', 'weekly'].includes(challenge.cadence)) return 1;
  const known = cache.get(challenge.cadence);
  if (known !== undefined) return known;
  const periods = new Set<string>();
  const end = Date.parse(definition.endsAt);
  for (let at = Date.parse(definition.startsAt); at < end; at += 3600000)
    periods.add(periodFor(challenge, definition, at));
  periods.add(periodFor(challenge, definition, end - 1));
  cache.set(challenge.cadence, periods.size);
  return periods.size;
}
export function availableXp(
  definition: Definition,
  path: (typeof paths)[number],
  cache = new Map<string, number>(),
): number {
  let total = 0;
  for (const challenge of definition.challenges.filter((v) => v.path === path)) {
    if (!['daily', 'weekly'].includes(challenge.cadence)) {
      total += challenge.xp;
      continue;
    }
    total += challenge.xp * challenge.limit * periodCount(definition, challenge, cache);
  }
  return total;
}
export function publicationProblems(definition: Definition): string[] {
  const cache = new Map<string, number>();
  const opportunities = paths.map((path) => availableXp(definition, path, cache));
  const required = definition.thresholds.at(-1)!;
  const problems: string[] = [];
  if (opportunities.some((v) => v < required))
    problems.push('Every path, including solo, must independently reach the maximum level.');
  if (Math.max(...opportunities) > Math.min(...opportunities) * 1.1)
    problems.push('Path XP opportunities must be within 10% of each other.');
  const maximumEntries = definition.challenges.reduce((sum, v) => sum + periodCount(definition, v, cache) * v.limit, 0);
  if (maximumEntries > 1000)
    problems.push('Reduce recurrence limits: at most 1,000 possible completions per member per season.');
  return problems;
}

export function seasonTemplate(now = Date.now()): Definition {
  return {
    schemaVersion: 1,
    slug: 'sands-of-beginnings',
    name: 'Sands of Beginnings',
    subtitle: 'Every journey leaves a mark.',
    description: 'Build, explore, supply, and share what you know. A free community season for every traveller.',
    number: 1,
    theme: 'dunes',
    startsAt: new Date(now + 3600000).toISOString(),
    endsAt: new Date(now + 30 * 86400000).toISOString(),
    timezone: 'UTC',
    thresholds: [0, 100, 250, 450, 700],
    rewards: [
      {
        id: 'wayfarer',
        name: 'Wayfarer',
        description: 'A title for those who begin their own journey.',
        level: 1,
        kind: 'title',
        motif: 'wing',
        color: 'sand',
      },
      {
        id: 'sandwalker',
        name: 'Sandwalker',
        description: 'A badge etched by the desert winds.',
        level: 2,
        kind: 'badge',
        motif: 'dune',
        color: 'sand',
      },
      {
        id: 'spice-horizon',
        name: 'Spice Horizon',
        description: 'A spice-blue horizon for your profile.',
        level: 3,
        kind: 'banner',
        motif: 'sun',
        color: 'blue',
      },
      {
        id: 'desert-spire',
        name: 'Desert Spire',
        description: 'An architectural seal for your showcase.',
        level: 4,
        kind: 'decoration',
        motif: 'spire',
        color: 'spice',
      },
      {
        id: 'first-light',
        name: 'First Light',
        description: 'Permanent recognition of a completed season.',
        level: 5,
        kind: 'achievement',
        motif: 'star',
        color: 'spice',
      },
    ],
    challenges: paths.map((path) => ({
      id: `${path}-contribution`,
      name: `${path[0].toUpperCase() + path.slice(1)} contribution`,
      description:
        path === 'solo'
          ? 'Submit a personal field journal or guide. No guild or event attendance required.'
          : `Submit a ${path} project, field report, contribution receipt, or guide for moderator review.`,
      path,
      cadence: 'seasonal',
      verification: 'review',
      xp: 700,
      limit: 1,
    })),
    milestones: [
      {
        id: 'shared-horizon',
        name: 'A shared horizon',
        description: 'Complete approved challenges together.',
        target: 100,
      },
    ],
  };
}
