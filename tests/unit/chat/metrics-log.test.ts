import { describe, expect, it, vi } from 'vitest';
import { createBridgeMetricsReporter } from '../../../src/features/chat/server/metrics-log';

const idle = {
  received: 0,
  persisted: 0,
  duplicates: 0,
  echoes: 0,
  rejected: 0,
  lastMessageAt: 0,
  reconnects: 0,
  pendingPublishes: 0,
  blocked: false,
  ready: true,
};
const logger = () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() });

describe('Chat Bridge status summaries', () => {
  it('prints a short idle status once, retaining full DEBUG diagnostics', () => {
    const log = logger();
    const report = createBridgeMetricsReporter(log);
    report(idle);
    report({ ...idle });
    expect(log.info).toHaveBeenCalledExactlyOnceWith('Live — waiting for game messages');
    expect(log.debug).toHaveBeenCalledTimes(2);
    expect(log.debug).toHaveBeenLastCalledWith('Chat diagnostics', idle);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('summarizes traffic without zero counters or structured details', () => {
    const log = logger();
    createBridgeMetricsReporter(log)({ ...idle, received: 12, persisted: 10, duplicates: 2 });
    expect(log.info).toHaveBeenCalledExactlyOnceWith('Live · 12 received · 10 saved · 2 duplicates ignored');
  });

  it('reports outages and backpressure as warnings and reports recovery', () => {
    const log = logger();
    const report = createBridgeMetricsReporter(log);
    report({ ...idle, ready: false });
    report({ ...idle, ready: false, blocked: true, pendingPublishes: 2 });
    report(idle);
    expect(log.warn).toHaveBeenNthCalledWith(1, 'Offline — reconnecting');
    expect(log.warn).toHaveBeenNthCalledWith(2, 'Paused — broker backpressure · 2 awaiting confirmation');
    expect(log.info).toHaveBeenCalledExactlyOnceWith('Live — waiting for game messages');
  });

  it('shows exceptional counters only when present and never claims game delivery', () => {
    const log = logger();
    createBridgeMetricsReporter(log)({ ...idle, echoes: 1, rejected: 2, reconnects: 3, pendingPublishes: 4 });
    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      'Live · 1 echo ignored · 2 rejected · 4 awaiting confirmation · 3 reconnects',
    );
  });
});
