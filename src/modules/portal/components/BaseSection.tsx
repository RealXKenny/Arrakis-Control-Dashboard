import { COLORS, styles } from '../config/colors';
import { useRef, useState } from 'react';
import { getBaseId } from '../utils/bases';
import BaseCard from './BaseCard';

function BaseGrid({
  bases,
  telemetry,
}) {
  if (bases.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          backgroundColor: '#ffffff03',
          border:
            `1px solid ${COLORS.borderLight}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            color: COLORS.textSoft,
            fontSize: '0.9rem',
            marginBottom: 5,
          }}
        >
          No bases found
        </div>

        <div
          style={{
            color: COLORS.dim,
            fontSize: '0.75rem',
          }}
        >
          There are currently no bases in
          this category.
        </div>
      </div>
    );
  }

  return (
    <div
      className="base-grid"
      style={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(2, minmax(0, 1fr))',
        gap: 18,
      }}
    >
      {bases.map((base, index) => {
        const isOddFinalBase =
          bases.length % 2 === 1 &&
          index === bases.length - 1;

        const baseId = getBaseId(base);

        return (
          <div
            key={
              baseId ??
              `base-${index}`
            }
            className={
              isOddFinalBase
                ? 'base-grid-last'
                : ''
            }
            style={{
              minWidth: 0,
              gridColumn: isOddFinalBase
                ? '1 / -1'
                : 'auto',
            }}
          >
            <BaseCard
              base={base}
              index={index}
              telemetry={
                baseId
                  ? telemetry[baseId]
                  : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export default function BaseSection({ playerId, visibleBases, basesTelemetry, basesLoading, bases, ownedBases, sharedBases, baseTab, setBaseTab }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  async function importBlueprint(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !playerId) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.set('player_id', String(playerId));
      formData.set('file', file);
      const response = await fetch('/api/blueprints/import', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Blueprint import failed (${response.status})`);
      window.alert('Blueprint imported successfully.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Blueprint import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
        {/* BASES */}
        <section
          style={{
            ...styles.panel,
            padding: 24,
            marginBottom: 20,
          }}
        >
          {/* Bases heading */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent:
                'space-between',
              gap: 15,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            <div>
              <p
                style={{
                  margin: '0 0 5px',
                  color:
                    COLORS.goldLight,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  letterSpacing: '1.5px',
                }}
              >
                Territory Network
              </p>

              <h2
                style={
                  styles.sectionTitle
                }
              >
                Bases
              </h2>
            </div>

            <div
              style={{
                color: COLORS.dim,
                fontSize: '0.72rem',
              }}
            >
              {ownedBases.length}{' '}
              owned ·{' '}
              {sharedBases.length}{' '}
              shared
            </div>

            <button
              type="button"
              disabled={importing || !playerId}
              onClick={() => fileInputRef.current?.click()}
              style={{
                appearance: 'none',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                padding: '8px 12px',
                backgroundColor: 'rgba(210,168,90,0.08)',
                color: COLORS.goldLight,
                cursor: importing ? 'wait' : 'pointer',
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {importing ? 'Importing…' : 'Import Blueprint ↑'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={importBlueprint}
              style={{ display: 'none' }}
            />
          </div>

          {/* Own / Shared tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: 8,
              padding: 5,
              marginBottom: 20,
              backgroundColor:
                '#0c0805',
              border:
                `1px solid ${COLORS.border}`,
              borderRadius: 10,
            }}
          >
            <button
              type="button"
              onClick={() =>
                setBaseTab('owned')
              }
              style={{
                appearance: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 7,
                padding: '11px 14px',
                backgroundColor:
                  baseTab === 'owned'
                    ? 'rgba(210,168,90,0.12)'
                    : 'transparent',
                color:
                  baseTab === 'owned'
                    ? COLORS.text
                    : COLORS.dim,
                boxShadow:
                  baseTab === 'owned'
                    ? 'inset 0 0 0 1px rgba(210,168,90,0.16)'
                    : 'none',
                fontSize: '0.76rem',
                fontWeight: 700,
                textTransform:
                  'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Own Bases

              <span
                style={{
                  marginLeft: 7,
                  color:
                    baseTab === 'owned'
                      ? COLORS.gold
                      : COLORS.dim,
                }}
              >
                {ownedBases.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setBaseTab('shared')
              }
              style={{
                appearance: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 7,
                padding: '11px 14px',
                backgroundColor:
                  baseTab === 'shared'
                    ? 'rgba(125,184,232,0.1)'
                    : 'transparent',
                color:
                  baseTab === 'shared'
                    ? '#b5d9f2'
                    : COLORS.dim,
                boxShadow:
                  baseTab === 'shared'
                    ? 'inset 0 0 0 1px rgba(125,184,232,0.15)'
                    : 'none',
                fontSize: '0.76rem',
                fontWeight: 700,
                textTransform:
                  'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Shared Bases

              <span
                style={{
                  marginLeft: 7,
                  color:
                    baseTab === 'shared'
                      ? COLORS.water
                      : COLORS.dim,
                }}
              >
                {sharedBases.length}
              </span>
            </button>
          </div>

          {/* Live telemetry status */}
          {basesLoading &&
            bases.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  gap: 9,
                  marginBottom: 14,
                  color: COLORS.dim,
                  fontSize: '0.68rem',
                }}
              >
                {/* GLOWING TELEMETRY DOT */}
                <span
                  className="portal-status-dot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor:
                      COLORS.gold,
                    boxShadow: `
                      0 0 4px ${COLORS.gold},
                      0 0 8px ${COLORS.gold},
                      0 0 16px ${COLORS.gold},
                      0 0 24px ${COLORS.gold}
                    `,
                  }}
                />

                Updating live
                telemetry...
              </div>
            )}

          <BaseGrid
            bases={visibleBases}
            telemetry={basesTelemetry}
          />
        </section>
    </>
  );
}
