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

      const { warmupDuneClient } = await import('./infrastructure/dune');
      startup.info('Connecting to Dune Console');
      await warmupDuneClient();
      startup.info('Dune Console connection ready');

      const { startPopulationRecorder } = await import('./modules/portal/server/population');
      startPopulationRecorder();
      startup.info('Population recorder started');
      startup.info('Dashboard services ready');
    } catch (error) {
      startup.error('Dashboard startup failed', error);
      return;
    }
  }
}
