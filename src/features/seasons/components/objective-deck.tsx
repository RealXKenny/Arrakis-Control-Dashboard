import { Button } from '../../../components/ui/button';
import { categoryLabels, categoryStats, rewardSummary, type ObjectiveCategory } from '../catalog';
import type { Definition, Progress } from '../contracts';

const symbols: Record<ObjectiveCategory, string> = {
  level: 'M40 128 80 72 120 128 M54 108 80 42 106 108 M80 42V24',
  story: 'M36 40H72L80 48 88 40H124V126H88L80 134 72 126H36Z M80 48V134 M48 62H66 M94 62H112 M48 80H66 M94 80H112',
  side_quest: 'M80 26 124 54V108L80 136 36 108V54Z M80 49V94 M80 108V114',
  faction: 'M42 30H118V88Q114 116 80 138Q46 116 42 88Z M80 48 102 82 80 112 58 82Z',
  exploration: 'M80 24 96 68 136 80 96 94 80 138 64 94 24 80 64 68Z M80 56V104 M56 80H104',
  achievement:
    'M48 34H112V76Q112 108 80 108Q48 108 48 76Z M48 46H28V66Q28 88 50 88 M112 46H132V66Q132 88 110 88 M80 108V132 M58 136H102',
};

/** Original vector illustrations; category structure is credited in the battle-pass provenance guide. */
export function ObjectiveDeck({
  definition,
  progress,
  now,
  selected,
  onSelect,
}: {
  definition: Definition;
  progress: Progress;
  now: number;
  selected: string;
  onSelect: (category: ObjectiveCategory) => void;
}) {
  const summary = rewardSummary(definition, progress);
  return (
    <section aria-labelledby="season-objectives-title" className="season-objectives">
      <div className="season-section-heading">
        <div>
          <span className="season-kicker">Your seasonal journey</span>
          <h2 id="season-objectives-title">Choose your next objective</h2>
        </div>
        <p>
          {summary.claimed}/{summary.total} rewards claimed ·{' '}
          {summary.ready > 0 ? `${summary.ready} level requirements met` : 'Your next reward awaits'}
        </p>
      </div>
      <p>
        Six ways to explore your objectives. Categories organize quests; every play style keeps its own path to the
        level cap.
      </p>
      <div className="season-objective-deck">
        {categoryStats(definition, progress, now).map((stat) => (
          <Button
            key={stat.category}
            className={`season-objective-card ${selected === stat.category ? 'is-selected' : ''}`}
            aria-pressed={selected === stat.category}
            onClick={() => onSelect(stat.category)}
          >
            <span className="season-objective-art">
              <svg viewBox="0 0 160 160" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="80" cy="80" r="70" strokeDasharray="2 8" />
                <path d={symbols[stat.category]} />
              </svg>
            </span>
            <span className="season-kicker">{String(stat.percent).padStart(2, '0')}% complete</span>
            <strong>{categoryLabels[stat.category]}</strong>
            <span>
              {stat.completed}/{stat.challenges.length} objectives
            </span>
            <span className="season-objective-meter" aria-hidden="true">
              <span style={{ width: `${stat.percent}%` }} />
            </span>
            <span>
              {stat.challenges.length ? `${stat.xp.toLocaleString()} XP per complete set` : 'No objectives configured'}
            </span>
            {stat.pending > 0 && <span>{stat.pending} awaiting review</span>}
          </Button>
        ))}
      </div>
    </section>
  );
}
