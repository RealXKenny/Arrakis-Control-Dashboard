'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import type { CapabilityReading } from '../capabilities';

const labels = {
  available: 'Available',
  permission: 'Credential or permission refused',
  unsupported: 'Reported unsupported',
  'rate-limited': 'Provider rate limited',
  unavailable: 'Unavailable or unrecognized response',
};

export function CapabilityReport() {
  const [readings, setReadings] = useState<CapabilityReading[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  async function check() {
    setPending(true);
    setError('');
    setReadings(null);
    try {
      const response = await fetch('/api/v2/monitoring/capabilities', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { readings?: unknown }).readings)
      )
        throw new Error();
      setReadings((data as { readings: CapabilityReading[] }).readings);
    } catch {
      setError('Capability check is unavailable. Try again later.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Card as="section" className="panel mb-6 p-6" aria-labelledby="capability-heading">
      <h2 id="capability-heading" className="text-lg">
        Integration capabilities
      </h2>
      <p className="mt-2 text-sm text-sand-400">
        Read-only checks of selected Console capabilities. Results can be cached for one minute; last success is
        retained only by this server process.
      </p>
      <Button
        type="button"
        disabled={pending}
        onClick={() => void check()}
        className="mt-4 min-h-11 border border-sand-200/20 px-4 text-sm"
      >
        {pending ? 'Checking…' : 'Check capabilities'}
      </Button>
      {error && (
        <p role="status" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {readings && (
        <ul className="mt-4 space-y-3">
          {readings.map((item) => (
            <li key={item.id} className="text-sm">
              <strong>{item.label}:</strong> {labels[item.state] ?? 'Unavailable'}. Checked{' '}
              <LocalTime value={item.checkedAt} />
              {now > 0 && now - Date.parse(item.checkedAt) > 120000 ? ' (stale)' : ''}; last successful check{' '}
              {item.lastSuccessAt ? <LocalTime value={item.lastSuccessAt} /> : 'not recorded'}
              {item.stale ? ' (last success is stale)' : ''}.
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
