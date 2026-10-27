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
      color: 'var(--theme-danger)',
      note: 'Current / maximum',
    },
    {
      label: 'Hydration',
      value: `${formatNumber(character.hydration, 0)} / 100`,
      fill: character.hydration,
      color: 'var(--theme-soft)',
      note: 'Water reserves',
    },
    {
      label: 'Rank & progress',
      value: character.level == null ? 'Unavailable' : `Level ${character.level}`,
      fill: character.level == null ? 0 : levelProgress.percent,
      color: 'var(--theme-accent)',
      note:
        character.xp == null
          ? 'Experience unavailable'
          : `${formatNumber(character.xp, 0)} XP${levelProgress.maxLevel ? ' · Maximum level' : ''}`,
    },
  ];
  return (
    <section className="vitals-grid mb-6 grid grid-cols-3 gap-4" aria-label="Character vitals">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-3xl border border-white/5 bg-zinc-900/40 p-6">
          <p className="m-0 mb-4 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{metric.label}</p>
          <strong className="mb-4 block text-2xl font-semibold text-zinc-100">{metric.value}</strong>
          <ProgressBar percent={metric.fill} color={metric.color} />
          <p className="mt-3 mb-0 text-[11px] text-zinc-400">{metric.note}</p>
        </div>
      ))}
    </section>
  );
}
