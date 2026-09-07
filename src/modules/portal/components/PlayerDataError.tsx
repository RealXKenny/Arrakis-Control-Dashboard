import { COLORS, styles } from '../config/colors';

export default function PlayerDataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main style={styles.page}>
      <div style={{ ...styles.container, maxWidth: 640 }}>
        <section role="alert" style={{ ...styles.panel, padding: 32 }}>
          <h1 style={{ fontSize: 28 }}>Profile temporarily unavailable</h1>
          <p style={{ color: COLORS.textSoft }}>{message}</p>
          <button type="button" onClick={onRetry}>Try again</button>
        </section>
      </div>
    </main>
  );
}
