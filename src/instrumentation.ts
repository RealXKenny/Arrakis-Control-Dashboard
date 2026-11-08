import './lib/assert-server';

const globals = globalThis as typeof globalThis & { arrakisDashboardStartup?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    if (globals.arrakisDashboardStartup) return;
    globals.arrakisDashboardStartup = true;

    const { createLogger } = await import('./lib/logger');
    const startup = createLogger('STARTUP');
    startup.header('ARRAKIS CONTROL', 'Dune: Awakening Dashboard');
    startup.info('Starting dashboard', {
      environment: process.env.NODE_ENV || 'development',
      runtime: process.version,
    });

    try {
      const { validateProductionEnv } = await import('./config/env');
      validateProductionEnv();
      startup.info('Runtime configuration validated');

      const env = validateProductionEnv();
      if (env.REDIS_URL) {
        const { getRedisPool } = await import('./lib/redis/pool');
        getRedisPool();
        startup.info('Redis pool configured for dashboard data');
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
