import { z } from 'zod';
import { themeForSeason } from './engine/themes';
import { definitionSchema, paths, publicationProblems, type Definition } from './contracts';

export const generatorSettingsSchema = z
  .object({
    firstNumber: z.number().int().min(1).max(99999),
    firstStart: z.iso
      .datetime()
      .max(35)
      .refine(
        (v) => Date.parse(v) >= Date.UTC(2020, 0, 1) && Date.parse(v) < Date.UTC(2100, 0, 1),
        'Choose a start between 2020 and 2099.',
      ),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Use an IANA timezone.'),
  })
  .strict();
export type GeneratorSettings = z.infer<typeof generatorSettingsSchema>;
export function automaticProgressTemplate(base: Definition): Definition {
  return {
    ...base,
    challenges: paths.flatMap((path) =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `${path}-${i + 1}`,
        name: `New season field milestone ${i + 1}`,
        description: `Earn ${(i + 1) * 1000} new game XP or complete ${i + 1} new journey objectives after this season's first verified observation. Existing XP, levels and completed objectives do not count.`,
        path,
        cadence: 'once' as const,
        verification: 'season-progress' as const,
        category: 'achievement' as const,
        minimumGameXp: (i + 1) * 1000,
        minimumNewJourneys: i + 1,
        xp: 2500,
        limit: 1,
      })),
    ),
  };
}
/** Calendar windows always derive from the original UTC anchor, avoiding month-end drift. */
export function seasonWindow(anchor: string, index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 10000)
    throw new Error('Season window is outside the supported range.');
  const first = new Date(anchor);
  const at = (offset: number) => {
    const date = new Date(first);
    date.setUTCDate(1);
    date.setUTCMonth(first.getUTCMonth() + offset * 3);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(first.getUTCDate(), last));
    return date.toISOString();
  };
  return { startsAt: at(index), endsAt: at(index + 1) };
}
export function currentWindow(anchor: string, now: number) {
  const first = new Date(anchor),
    date = new Date(now);
  let index = Math.max(
    0,
    Math.floor(((date.getUTCFullYear() - first.getUTCFullYear()) * 12 + date.getUTCMonth() - first.getUTCMonth()) / 3),
  );
  if (Date.parse(seasonWindow(anchor, index).startsAt) > now) index = Math.max(0, index - 1);
  return index;
}
function rank(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}
export function validateGeneratorTemplate(input: Definition) {
  const base = definitionSchema.parse(input);
  if (
    base.thresholds.length !== 100 ||
    base.rewards.length !== 100 ||
    new Set(base.rewards.map((r) => r.level)).size !== 100 ||
    paths.some((path) => base.challenges.filter((c) => c.path === path).length !== 20)
  )
    throw new Error('Automatic seasons require 100 reward levels and 20 objectives for each of the five paths.');
  if (base.challenges.some((c) => c.verification === 'review'))
    throw new Error(
      'Fully automatic seasons require API-observed objectives only. Text and image evidence cannot be approved automatically.',
    );
  if (base.challenges.some((c) => c.verification === 'linked-character'))
    throw new Error('A character link cannot prove new in-game progress.');
  return base;
}
/** Version 1: deterministic ordering/XP weights and curve; curated objectives, never invented API evidence. */
export function generateSeason(
  base: Definition,
  settings: GeneratorSettings,
  number: number,
  windowIndex: number,
): Definition {
  validateGeneratorTemplate(base);
  const window = seasonWindow(settings.firstStart, windowIndex);
  const theme = themeForSeason(number);
  const challenges = paths.flatMap((path) => {
    const ordered = base.challenges
      .filter((c) => c.path === path)
      .map((c) => structuredClone(c))
      .sort((a, b) => rank(`${number}:${a.id}`) - rank(`${number}:${b.id}`) || a.id.localeCompare(b.id));
    const weights = ordered.map((c) => 1 + (rank(`xp:${number}:${c.id}`) % 5)),
      sum = weights.reduce((a, b) => a + b, 0);
    const awards = weights.map((w) => Math.floor((50000 * w) / sum));
    let remainder = 50000 - awards.reduce((a, b) => a + b, 0);
    return ordered.map((c, i) => ({
      ...c,
      ...(c.verification === 'season-progress'
        ? {
            personalized: true as const,
            name: `${theme.title} milestone ${i + 1}`,
            description:
              'Your personal objective for this milestone is fixed from your first verified observation and shown in your season plan. Existing progress never counts.',
          }
        : {}),
      id: `${path}-${String(i + 1).padStart(2, '0')}`,
      cadence: c.verification === 'review' ? ('seasonal' as const) : ('once' as const),
      limit: 1,
      xp: awards[i] + (remainder-- > 0 ? 1 : 0),
    }));
  });
  const rewards = [...base.rewards]
    .sort((a, b) => a.level - b.level)
    .map(({ artwork: _art, ...r }) => ({
      ...r,
      id: `level-${r.level}`,
      name: `Season ${number} · ${r.name}`.slice(0, 100),
      description: `Permanent Season ${number} recognition. ${r.description}`.slice(0, 600),
    }));
  const definition = definitionSchema.parse({
    schemaVersion: 1,
    slug: `season-${number}`,
    number,
    name: `Season ${number}`,
    subtitle: theme.subtitle,
    description: `${theme.blurb} A free community season requiring new in-game progress after tracking begins. Each path offers 50,000 Season XP and can reach all 100 levels. Existing levels and completed journeys do not count. Verified XP and cosmetic claiming are automatic; configured game rewards use the separate reviewed delivery queue.`,
    theme: theme.visual,
    ...window,
    timezone: settings.timezone,
    thresholds: Array.from({ length: 100 }, (_, i) => Math.round(49500 * Math.pow(i / 99, 1.12))),
    challenges,
    rewards,
    milestones: [
      {
        id: 'first-steps',
        name: 'First steps together',
        description: 'Complete approved objectives together across every path.',
        target: 25,
      },
      {
        id: 'shared-horizon',
        name: 'A shared horizon',
        description: 'Build a lasting community through approved in-game contributions.',
        target: 100,
      },
      {
        id: 'season-legacy',
        name: 'Season legacy',
        description: 'Celebrate five hundred approved community objectives.',
        target: 500,
      },
    ],
  });
  const problems = publicationProblems(definition);
  if (problems.length) throw new Error(problems.join(' '));
  return definition;
}
