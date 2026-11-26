'use client';

import { formatUtc } from '../../../lib/time';
import { useEffect, useState } from 'react';
import { formatCoriolisCountdown } from '../utils/coriolis';
import styles from '../styles/map.module.css';

export default function CoriolisCountdown({ cycleAt }: { cycleAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cycleAt]);

  return (
    <span
      role="timer"
      aria-label="Coriolis cycle countdown"
      title={cycleAt ? `Next Coriolis cycle: ${formatUtc(cycleAt)}` : 'Cycle time unavailable'}
      className={styles.coriolisCountdown}
    >
      <span>Coriolis</span>
      <strong>{formatCoriolisCountdown(cycleAt, now)}</strong>
    </span>
  );
}
