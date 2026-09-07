export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { warmupDuneClient } = await import("./src/infrastructure/dune");
    await warmupDuneClient();
    const { logger } = await import("./src/lib/logger");
    console.clear();
    logger.header("ARRAKIS CONTROL", "Dune: Awakening Dashboard");
  } catch (error) {
    const { logger } = await import("./src/lib/logger");
    logger.error("Dune startup authentication failed.", { error });
  }
}
