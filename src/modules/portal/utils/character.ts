import { getNumber } from './formatting';
import { getCurrencyValue } from './telemetry';

export function buildCharacter(player) {
  const details = player.details || {};

  const progression = details.progression || {};

  const intel = details.intel || {};

  const vitals = details.vitals || {};

  const solarisCoin = details['solaris-coin'] || {};

  const character = {
    name: player.characterName || 'Unknown Character',

    status: player.onlineStatus || 'Offline',

    guild: details.guild ?? null,

    level: getNumber(
      progression.level,
      progression.characterLevel,
      progression.character_level,
      details.level,
      player.level,
    ),

    xp: getNumber(
      progression.xp,
      progression.experience,
      progression.experiencePoints,
      progression.experience_points,
      details.xp,
      player.xp,
    ),

    intel: getNumber(intel.intel),

    maxIntel: getNumber(intel.maxIntel),

    solaris: getNumber(solarisCoin.total),

    health: getNumber(vitals.currentHealth),

    maxHealth: getNumber(vitals.maxHealth),

    hydration: getNumber(vitals.hydration),

    solarisCredit: getCurrencyValue(
      player.currency,
      details.currency,
      player.solarisCredit,
      player.solaris_credit,
      player.credit,
      player.credits,
    ),

    scrip: getNumber(details.scrip, player.scrip),
  };

  return character;
}
