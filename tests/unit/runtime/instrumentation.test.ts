import { beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../../../package.json';

/**
 * Startup contract: an invalid PRODUCTION configuration stops the server (Next refuses to serve when `register()`
 * throws), while the optional warm-up steps may fail without taking the site down. Found by running the installed
 * release with a missing AUTH_SECRET: it used to log "Dashboard startup failed" and then serve traffic anyway.
 */
const { validate, warmup, error, warn, info, publisher, eventsStart } = vi.hoisted(() => ({
  validate: vi.fn(),
  warmup: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  publisher: vi.fn(),
  eventsStart: vi.fn(),
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/logger', () => ({
  createLogger: () => ({ header: vi.fn(), info, warn, error, debug: vi.fn(), fatal: vi.fn() }),
}));
vi.mock('../../../src/config/env', () => ({ validateProductionEnv: validate, redisTransportWarnings: () => [] }));
vi.mock('../../../src/lib/redis/pool', () => ({ getRedisPool: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => ({ warmupDuneClient: warmup }));
vi.mock('../../../src/features/portal/server/population', () => ({ startPopulationRecorder: vi.fn() }));
vi.mock('../../../src/features/changelog/server/announce', () => ({
  announceLatestRelease: vi.fn().mockResolvedValue('disabled'),
}));
vi.mock('../../../src/features/chat/server/publisher', () => ({ getChatPublisher: publisher }));
vi.mock('../../../src/features/events/server/announce', () => ({ startCommunityEventAnnouncements: eventsStart }));

async function register() {
  vi.resetModules();
  delete (globalThis as { arrakisDashboardStartup?: boolean }).arrakisDashboardStartup;
  return (await import('../../../src/instrumentation')).register();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', '');
  validate.mockReturnValue({ REDIS_URL: undefined });
  warmup.mockResolvedValue(undefined);
});

describe('server startup', () => {
  it('starts configured event announcements independently of Console warmup', async () => {
    validate.mockReturnValue({ DISCORD_BOT_TOKEN: 'fixture', COMMUNITY_EVENTS_CHANNEL_ID: '1539748867833200640' });
    warmup.mockRejectedValue(new Error('Console unavailable'));
    await register();
    expect(eventsStart).toHaveBeenCalledOnce();
    expect(eventsStart.mock.invocationCallOrder[0]).toBeLessThan(warmup.mock.invocationCallOrder[0]);
  });
  it('starts the chat publisher before Console warmup without waiting for a browser request', async () => {
    validate.mockReturnValue({ CHAT_ENABLED: true });
    await expect(register()).resolves.toBeUndefined();
    expect(publisher).toHaveBeenCalledOnce();
    expect(publisher.mock.invocationCallOrder[0]).toBeLessThan(warmup.mock.invocationCallOrder[0]);
  });
  it('refuses to start when the production configuration is invalid, naming the variable but never a value', async () => {
    validate.mockImplementation(() => {
      throw new Error('Missing server environment configuration: AUTH_SECRET');
    });
    await expect(register()).rejects.toThrow('AUTH_SECRET');
    expect(error).toHaveBeenCalledWith('Production configuration is invalid; refusing to start', {
      reason: 'Missing server environment configuration: AUTH_SECRET',
    });
    expect(warmup).not.toHaveBeenCalled();
  });

  it('keeps serving when only the Console warm-up fails', async () => {
    warmup.mockRejectedValue(new Error('Console down'));
    await expect(register()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Dashboard startup failed', expect.any(Error));
  });

  it('starts normally with a valid configuration', async () => {
    await expect(register()).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('Runtime configuration validated');
    expect(info).toHaveBeenCalledWith('Starting dashboard', expect.objectContaining({ version }));
  });

  it('does nothing during the production build phase', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    validate.mockImplementation(() => {
      throw new Error('should not run');
    });
    await expect(register()).resolves.toBeUndefined();
    expect(validate).not.toHaveBeenCalled();
  });
});
