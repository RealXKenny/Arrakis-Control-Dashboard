import './lib/assert-server';

const globals = globalThis as typeof globalThis & { arrakisDashboardStartup?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    if (globals.arrakisDashboardStartup) return;
    globals.arrakisDashboardStartup = true;

    const { createLogger } = await import('./lib/logger');
    const startup = createLogger('STARTUP');
    const { version } = await import('../package.json');
    startup.header(`ARRAKIS CONTROL v${version}`, 'Dune: Awakening Dashboard');
    startup.info('Starting dashboard', {
      version,
      environment: process.env.NODE_ENV || 'development',
      runtime: process.version,
    });

    // Dev note: a misconfigured production server that smiles and serves anyway is a trap with a welcome mat.
    // Configuration errors stop startup (Next refuses to serve when register() throws); only the optional warm-up
    // steps below may fail without taking the site down. The reason names variables, never their values.
    const { validateProductionEnv, redisTransportWarnings } = await import('./config/env');
    let env: ReturnType<typeof validateProductionEnv>;
    try {
      env = validateProductionEnv();
    } catch (error) {
      startup.error('Production configuration is invalid; refusing to start', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
    if (env.CHAT_ENABLED) {
      const { getChatPublisher } = await import('./features/chat/server/publisher');
      getChatPublisher();
    }
    startup.info('Runtime configuration validated');
    if (env.DISCORD_BOT_TOKEN && env.COMMUNITY_EVENTS_CHANNEL_ID) {
      const { startCommunityEventAnnouncements } = await import('./features/events/server/announce');
      startCommunityEventAnnouncements();
    }

    try {
      for (const warning of redisTransportWarnings(env)) startup.warn(warning);
      if (env.REDIS_URL) {
        const { getRedisPool } = await import('./lib/redis/pool');
        getRedisPool();
        startup.info('Redis pool configured for dashboard data', {
          mode: env.REDIS_CLUSTER_NODES ? 'cluster' : 'standalone',
          connections: 4,
        });
      }

      const { warmupDuneClient } = await import('./server/integrations/dune');
      startup.info('Connecting to Dune Console');
      await warmupDuneClient();
      startup.info('Dune Console connection ready');

      const { startPopulationRecorder } = await import('./features/portal/server/population');
      startPopulationRecorder();
      startup.info('Population recorder started');
      startup.info('Dashboard services ready');

      // Fire and forget: an announcement hiccup must never delay or fail startup.
      const { announceLatestRelease } = await import('./features/changelog/server/announce');
      void announceLatestRelease()
        .then((outcome) => {
          if (outcome !== 'disabled') startup.info('Changelog announcer checked', { outcome });
        })
        .catch((error) => startup.warn('Changelog announcer failed', { error }));
    } catch (error) {
      startup.error('Dashboard startup failed', error);
      return;
    }
  }
}
