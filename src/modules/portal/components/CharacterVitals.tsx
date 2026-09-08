import { COLORS, styles } from '../config/colors';
import { formatNumber } from '../utils/formatting';
import ProgressBar from './ProgressBar';
import type { buildCharacter } from '../utils/character';
import type { getLevelProgress } from '../utils/progression';

export default function CharacterVitals({
  character,
  levelProgress,
  percent,
}: {
  character: ReturnType<typeof buildCharacter>;
  levelProgress: ReturnType<typeof getLevelProgress>;
  percent: (value: number, max: number) => number;
}) {
  const metrics = [
    {
      label: 'Health',
      value: `${formatNumber(character.health, 0)} / ${formatNumber(character.maxHealth, 0)}`,
      fill: percent(character.health, character.maxHealth),
      color: COLORS.red,
      note: 'Current / maximum',
    },
    {
      label: 'Hydration',
      value: `${formatNumber(character.hydration, 0)} / 100`,
      fill: character.hydration,
      color: COLORS.water,
      note: 'Water reserves',
    },
    {
      label: 'Rank & progress',
      value: character.level == null ? 'Unavailable' : `Level ${character.level}`,
      fill: character.level == null ? 0 : levelProgress.percent,
      color: COLORS.gold,
      note:
        character.xp == null
          ? 'Experience unavailable'
          : `${formatNumber(character.xp, 0)} XP${levelProgress.maxLevel ? ' · Maximum level' : ''}`,
    },
  ];
  return (
    <section
      className="vitals-grid"
      aria-label="Character vitals"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 18, marginBottom: 24 }}
    >
      {metrics.map((metric) => (
        <div key={metric.label} style={{ ...styles.panel, padding: 24 }}>
          <p
            style={{
              margin: '0 0 16px',
              color: COLORS.muted,
              textTransform: 'uppercase',
              fontSize: 11,
              letterSpacing: 1.5,
            }}
          >
            {metric.label}
          </p>
          <strong style={{ display: 'block', fontSize: 28, marginBottom: 16, color: COLORS.text }}>
            {metric.value}
          </strong>
          <ProgressBar percent={metric.fill} color={metric.color} />
          <p style={{ color: COLORS.muted, fontSize: 11, margin: '12px 0 0' }}>{metric.note}</p>
        </div>
      ))}
    </section>
  );
}
