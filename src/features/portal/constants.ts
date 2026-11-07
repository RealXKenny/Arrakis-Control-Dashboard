export const REFRESH_INTERVAL = 30000;

export const FUEL_BURN_SECONDS = {
  fuel: 3600,
  spice: 5400,
  windTurbineOmni: 3600,
  windTurbineDirectional: 5400,
};

export const GENERATOR_FUEL_CAP = 499;

export function generatorUptimePolicy(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.getUTCFullYear() === 2026 && (date.getUTCMonth() === 6 || date.getUTCMonth() === 7) ? 2 : 1;
}
