import { COLORS, styles } from '../config/colors';
import { formatNumber } from '../utils/formatting';

export default function InventoryAssets({ character }) {
  return (
    <>
        {/* Inventory & currencies */}
        <section
          style={{
            ...styles.panel,
            padding: 22,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'space-between',
              gap: 12,
              marginBottom: 18,
              paddingBottom: 13,
              borderBottom:
                `1px solid ${COLORS.borderLight}`,
            }}
          >
            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                Inventory & Assets
              </h2>

              <p
                style={{
                  color: COLORS.dim,
                  fontSize: '0.7rem',
                  margin: '4px 0 0',
                }}
              >
                Personal resources
                and financial assets
              </p>
            </div>
          </div>

          <div
            className="currency-grid"
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: 13,
            }}
          >
            {/* Solaris Coin */}
            <div
              style={{
                padding: 16,
                backgroundColor:
                  '#ffffff04',
                border:
                  `1px solid ${COLORS.borderLight}`,
                borderRadius: 9,
              }}
            >
              <div
                style={{
                  color: COLORS.muted,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 7,
                }}
              >
                Solaris Coin
              </div>

              <strong
                style={{
                  color: COLORS.gold,
                  fontSize: '1.15rem',
                }}
              >
                {formatNumber(
                  character.solaris,
                  0
                )}
              </strong>
            </div>

            {/* Intel Bank */}
            <div
              style={{
                padding: 16,
                backgroundColor:
                  '#ffffff04',
                border:
                  `1px solid ${COLORS.borderLight}`,
                borderRadius: 9,
              }}
            >
              <div
                style={{
                  color: COLORS.muted,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 7,
                }}
              >
                Intel Bank
              </div>

              <strong
                style={{
                  color: COLORS.textSoft,
                  fontSize: '1.15rem',
                }}
              >
                {formatNumber(
                  character.intel,
                  0
                )}{' '}
                /{' '}
                {formatNumber(
                  character.maxIntel,
                  0
                )}
              </strong>
            </div>

            {/* Solaris Credit */}
            <div
              style={{
                padding: 16,
                backgroundColor:
                  '#ffffff04',
                border:
                  `1px solid ${COLORS.borderLight}`,
                borderRadius: 9,
              }}
            >
              <div
                style={{
                  color: COLORS.muted,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 7,
                }}
              >
                Solaris Credit
              </div>

              <strong
                style={{
                  color: COLORS.gold,
                  fontSize: '1.15rem',
                }}
              >
                {formatNumber(
                  character.solarisCredit,
                  0
                )}
              </strong>
            </div>

            {/* Scrip */}
            <div
              style={{
                padding: 16,
                backgroundColor:
                  '#ffffff04',
                border:
                  `1px solid ${COLORS.borderLight}`,
                borderRadius: 9,
              }}
            >
              <div
                style={{
                  color: COLORS.muted,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 7,
                }}
              >
                Scrip
              </div>

              <strong
                style={{
                  color: COLORS.textSoft,
                  fontSize: '1.15rem',
                }}
              >
                {formatNumber(
                  character.scrip,
                  0
                )}
              </strong>
            </div>
          </div>
        </section>
    </>
  );
}
