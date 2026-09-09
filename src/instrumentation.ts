import './lib/assert-server';
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
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
      logger.error('Dune startup configuration failed.', { error });
    }
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startPopulationRecorder } = await import('./modules/portal/server/population');
      startPopulationRecorder();
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
