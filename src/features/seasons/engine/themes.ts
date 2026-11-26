import { seededRandom } from './rng';

export type SeasonTheme = {
  id: string;
  title: string;
  subtitle: string;
  blurb: string;
  visual: 'dunes' | 'eclipse' | 'spice';
  /** Reward-pool flavor used by the reward generator: item name fragments are matched case-insensitively. */
  focus: readonly string[];
};
export const THEMES: readonly SeasonTheme[] = [
  {
    id: 'desert-survival',
    title: 'Desert Survival',
    subtitle: 'Endure the sands. Outlast the sun.',
    blurb: 'Water discipline, shelter and steady field craft define this season.',
    visual: 'dunes',
    focus: ['water', 'stillsuit', 'cloth', 'fiber', 'plant'],
  },
  {
    id: 'spice-operations',
    title: 'Spice Operations',
    subtitle: 'Follow the melange.',
    blurb: 'Harvest, refine and move spice while the desert watches.',
    visual: 'spice',
    focus: ['spice', 'melange', 'harvest', 'refin'],
  },
  {
    id: 'exploration-expeditions',
    title: 'Exploration Expeditions',
    subtitle: 'Every horizon hides a story.',
    blurb: 'Chart unfamiliar ground and finish journeys you have not yet written.',
    visual: 'eclipse',
    focus: ['scan', 'compass', 'map', 'binocular'],
  },
  {
    id: 'industrial-development',
    title: 'Industrial Development',
    subtitle: 'Build what outlasts the storm.',
    blurb: 'Foundations, power and production lines for a lasting base.',
    visual: 'dunes',
    focus: ['ore', 'plate', 'steel', 'ingot', 'component'],
  },
  {
    id: 'vehicle-mastery',
    title: 'Vehicle Mastery',
    subtitle: 'Fast on the sand, faster in the wind.',
    blurb: 'Keep every machine running and every route open.',
    visual: 'eclipse',
    focus: ['engine', 'tread', 'chassis', 'fuel', 'vehicle'],
  },
  {
    id: 'faction-advancement',
    title: 'Faction Advancement',
    subtitle: 'Allegiance is earned in action.',
    blurb: 'Rise through contracts and standing without ever being forced to fight.',
    visual: 'spice',
    focus: ['kit', 'contract', 'badge', 'insignia'],
  },
  {
    id: 'deep-desert-operations',
    title: 'Deep Desert Operations',
    subtitle: 'Past the Shield Wall, nothing is guaranteed.',
    blurb: 'Prepare thoroughly for the harshest ground in Arrakis.',
    visual: 'eclipse',
    focus: ['shield', 'armor', 'repair', 'medical'],
  },
  {
    id: 'resource-expeditions',
    title: 'Resource Expeditions',
    subtitle: 'Gather wide. Stockpile wisely.',
    blurb: 'Turn raw material runs into a thriving workshop.',
    visual: 'dunes',
    focus: ['copper', 'aluminum', 'granite', 'plastanium', 'ore'],
  },
];
function cycleOrder(cycle: number) {
  const order = THEMES.map((_, i) => i);
  const random = seededRandom(`theme-cycle:${cycle}`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
function orderFor(cycle: number) {
  const order = cycleOrder(cycle);
  if (cycle > 0 && order[0] === cycleOrder(cycle - 1)[THEMES.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order;
}
/**
 * Deterministic theme sequence with no repeat inside a cycle of eight seasons and never the same theme twice in a row
 * across cycles. Depends only on the season number, so it can be recomputed and audited at any time.
 */
export function themeForSeason(number: number): SeasonTheme {
  const n = Math.max(1, number);
  return THEMES[orderFor(Math.floor((n - 1) / THEMES.length))[(n - 1) % THEMES.length]];
}
