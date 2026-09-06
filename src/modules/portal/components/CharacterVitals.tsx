import { COLORS, styles } from '../config/colors';
import { formatNumber } from '../utils/formatting';
import ProgressBar from './ProgressBar';

export default function CharacterVitals({ character, levelProgress, percent }) {
  return (
    <>
        {/* Vitals */}
        <section
          className="vitals-grid"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(3, minmax(0, 1fr))',
            gap: 15,
            marginBottom: 24,
          }}
        >
          {/* Health */}
          <div
            style={{
              ...styles.panel,
              padding: 20,
            }}
          >
            <div
              style={{
                color: COLORS.muted,
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform:
                  'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 8,
              }}
            >
              Health
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: '1.35rem',
                fontWeight: 700,
                marginBottom: 9,
              }}
            >
              {character.health} /{' '}
              {character.maxHealth}
            </div>

            <ProgressBar
              percent={percent(
                character.health,
                character.maxHealth
              )}
              color={COLORS.red}
            />
          </div>

          {/* Hydration */}
          <div
            style={{
              ...styles.panel,
              padding: 20,
            }}
          >
            <div
              style={{
                color: COLORS.muted,
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform:
                  'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 8,
              }}
            >
              Hydration
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: '1.35rem',
                fontWeight: 700,
                marginBottom: 9,
              }}
            >
              {character.hydration} / 100
            </div>

            <ProgressBar
              percent={
                character.hydration
              }
              color={COLORS.blue}
            />
          </div>

          {/* Rank & Level Progress */}
          <div
            style={{
              ...styles.panel,
              padding: 20,
            }}
          >
            <div
              style={{
                color: COLORS.muted,
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 8,
              }}
            >
              Rank & Progress
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  color: '#f3d39b',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                }}
              >
                Level {character.level}
              </div>

              <div
                style={{
                  color: COLORS.gold,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                {levelProgress.maxLevel
                  ? 'MAX'
                  : `${levelProgress.percent.toFixed(0)}%`}
              </div>
            </div>

            <ProgressBar
              percent={levelProgress.percent}
              color={COLORS.gold}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 7,
                color: COLORS.muted,
                fontSize: '0.68rem',
              }}
            >
              <span>
                {formatNumber(levelProgress.currentXp, 0)} XP
              </span>

              <span>
                {levelProgress.maxLevel
                  ? 'Level 200'
                  : `${formatNumber(
                      levelProgress.nextLevelXp,
                      0
                    )} XP`}
              </span>
            </div>

            <div
              style={{
                color: COLORS.dim,
                fontSize: '0.68rem',
                marginTop: 7,
              }}
            >
              {levelProgress.maxLevel
                ? 'Maximum level reached'
                : `${formatNumber(
                    levelProgress.remainingXp,
                    0
                  )} XP to Level ${
                    Number(character.level) + 1
                  }`}
            </div>
          </div>
        </section>
    </>
  );
}
