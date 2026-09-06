export async function register() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLED === "true",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { warmupDuneClient } = await import("./src/infrastructure/dune");
    await warmupDuneClient();
    const { logger } = await import("./src/lib/logger");
    logger.info("Dune console session ready before serving requests.");
  } catch (error) {
    const { logger } = await import("./src/lib/logger");
    logger.error("Dune startup authentication failed.", { error });
  }
}
