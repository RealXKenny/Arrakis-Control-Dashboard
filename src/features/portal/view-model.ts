import { normalizeVehicles, type Vehicle } from '../vehicles/normalize';
import {
  extractBases,
  getBaseId,
  getBaseName,
  getBaseOwner,
  getBaseType,
  getGeneratorSeconds,
  getMaxGeneratorUptimeSeconds,
  getStorageData,
  getWaterData,
  isOwnedBase,
} from '../bases/view-model';
import { buildCharacter } from '../player/character';
import { clampPercent, formatStorage, formatVolume } from '../../lib/format';
import { guildRoleLabel } from './guild';
import { label, record } from '../player/inventory';

/**
 * Typed, display-ready view of the legacy player profile. Built once on the server so pages receive
 * small, stable shapes instead of walking provider payloads in components.
 */

export interface Gauge {
  /** 0 to 100, or null when the reading is unavailable. */
  percent: number | null;
  text: string;
}

export interface PortalBase {
  id: string;
  name: string;
  type: string;
  owner: string;
  owned: boolean;
  runtime: Gauge;
  water: Gauge;
  storage: Gauge;
  /** True when water or storage telemetry failed and the card should say so. */
  telemetryGap: boolean;
}

export interface PortalCharacter {
  name: string;
  status: string;
  avatarUrl: string | null;
  level: number | null;
  xp: number | null;
  intel: number | null;
  solarisCredit: number | null;
  pocketSolari: number | null;
  scrip: number | null;
  unspentSkillPoints: unknown;
  guild: { name: string; faction: string; rank: string } | null;
}

export interface PortalProfile {
  character: PortalCharacter;
  /** The legacy character record, consumed by the client components that are still being rewritten. */
  legacyCharacter: ReturnType<typeof buildCharacter>;
  bases: PortalBase[];
  vehicles: Vehicle[];
  /** Raw provider sections (factions, specs, journey, inventory...) for the detail pages. */
  details: Record<string, unknown>;
}

function runtimeGauge(base: Record<string, unknown>): Gauge {
  if (base.generatorDataAvailable === false) return { percent: null, text: 'Unavailable' };
  const seconds = getGeneratorSeconds(base);
  const percent = clampPercent((seconds / getMaxGeneratorUptimeSeconds(base)) * 100);
  const days = seconds / 86_400;
  const whole = Math.floor(days);
  return { percent, text: `${whole}d ${Math.floor((days - whole) * 24)}h remaining` };
}

function waterGauge(base: Record<string, unknown>): Gauge {
  const water = getWaterData(base.water ?? base.waterData ?? base);
  const known = water.available && water.max !== null && water.max > 0;
  return {
    percent: water.percent,
    text: known
      ? `${formatVolume(water.current)} / ${formatVolume(water.max)}`
      : water.max !== null
        ? `— / ${formatVolume(water.max)}`
        : 'No data',
  };
}

function storageGauge(base: Record<string, unknown>): Gauge {
  const storage = getStorageData(base.inventory ?? base.inventoryData ?? base);
  const known = storage.available && storage.max !== null && storage.max > 0;
  return {
    percent: storage.percent,
    text: known ? `${formatStorage(storage.used)} / ${formatStorage(storage.max)}` : 'No data',
  };
}

export function buildPortalBases(player: unknown): PortalBase[] {
  return (extractBases(player) as Array<Record<string, unknown>>).map((base, index) => {
    const water = waterGauge(base);
    const storage = storageGauge(base);
    return {
      id: String(getBaseId(base) ?? `base-${index}`),
      name: String(getBaseName(base, index)),
      type: String(getBaseType(base)),
      owner: String(getBaseOwner(base)),
      owned: isOwnedBase(base),
      runtime: runtimeGauge(base),
      water,
      storage,
      telemetryGap:
        (base.waterDataAvailable === false && water.percent === null) ||
        (base.inventoryDataAvailable === false && storage.percent === null),
    };
  });
}

export function buildPortalProfile(player: Record<string, unknown>): PortalProfile {
  const character = buildCharacter(player);
  const details = record(player.details);
  const guild = record(character.guild);
  const characterName = character.name;
  return {
    legacyCharacter: character,
    character: {
      name: characterName,
      status: character.status,
      avatarUrl: character.avatarUrl,
      level: character.level,
      xp: character.xp,
      intel: character.intel,
      solarisCredit: character.solarisCredit,
      pocketSolari: character.solaris,
      scrip: character.scrip,
      unspentSkillPoints: record(details.progression).unspentSkillPoints,
      guild: character.guild
        ? {
            name: label(guild.name, 'No guild reported'),
            faction: label(guild.faction, 'Not reported'),
            rank: guildRoleLabel(guild.rank),
          }
        : null,
    },
    bases: buildPortalBases(player),
    vehicles: normalizeVehicles(details.vehicles, characterName),
    details,
  };
}
