export function getPlayerDetails(player) {
  return player?.details ?? {};
}

export function getPlayerProgression(player) {
  return player?.details?.progression ?? {};
}

export function getPlayerIntel(player) {
  return player?.details?.intel ?? {};
}

export function getPlayerVitals(player) {
  return player?.details?.vitals ?? {};
}

export function getPlayerSolarisCoin(player) {
  return player?.details?.['solaris-coin'] ?? {};
}
