import type { Logger } from '../../../lib/logger';

type BridgeMetrics = {
  received: number;
  persisted: number;
  duplicates: number;
  echoes: number;
  rejected: number;
  lastMessageAt: number;
  reconnects: number;
  pendingPublishes: number;
  blocked: boolean;
  ready: boolean;
};

/** Report changes once; retain the full diagnostic snapshot at DEBUG. */
export function createBridgeMetricsReporter(log: Pick<Logger, 'info' | 'warn' | 'debug'>) {
  let previous = '';
  return (metrics: BridgeMetrics): void => {
    log.debug('Chat diagnostics', metrics);
    const fingerprint = JSON.stringify(metrics);
    if (fingerprint === previous) return;
    previous = fingerprint;

    const details: string[] = [];
    if (metrics.received) details.push(`${metrics.received} received`, `${metrics.persisted} saved`);
    if (metrics.duplicates)
      details.push(`${metrics.duplicates} duplicate${metrics.duplicates === 1 ? '' : 's'} ignored`);
    if (metrics.echoes) details.push(`${metrics.echoes} ${metrics.echoes === 1 ? 'echo' : 'echoes'} ignored`);
    if (metrics.rejected) details.push(`${metrics.rejected} rejected`);
    if (metrics.pendingPublishes) details.push(`${metrics.pendingPublishes} awaiting confirmation`);
    if (metrics.reconnects) details.push(`${metrics.reconnects} reconnect${metrics.reconnects === 1 ? '' : 's'}`);

    const status = metrics.blocked
      ? 'Paused — broker backpressure'
      : !metrics.ready
        ? 'Offline — reconnecting'
        : 'Live';
    const summary = details.length
      ? `${status} · ${details.join(' · ')}`
      : status === 'Live'
        ? 'Live — waiting for game messages'
        : status;
    if (!metrics.ready || metrics.blocked) log.warn(summary);
    else log.info(summary);
  };
}
