import './lib/assert-server';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    const { validateProductionEnv } = await import('./config/env');
    validateProductionEnv();
    try {
      const { warmupDuneClient } = await import('./infrastructure/dune');
      await warmupDuneClient();
      const { logger } = await import('./lib/logger');
      logger.header('ARRAKIS CONTROL', 'Dune: Awakening Dashboard');
      logger.info('Dashboard loaded');
    } catch (error) {
      const { logger } = await import('./lib/logger');
      logger.error('Dune startup authentication failed.', error);
      return;
    }
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startPopulationRecorder } = await import('./modules/portal/server/population');
      startPopulationRecorder();
    }
  }
}
