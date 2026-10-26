export const COLORS = Object.freeze({
  reset: '\u001B[0m',
  dim: '\u001B[2m',
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  red: '\u001B[31m',
  magenta: '\u001B[35m',
  blue: '\u001B[34m',
  brightCyan: '\u001B[96m',
  brightGreen: '\u001B[92m',
  brightYellow: '\u001B[93m',
  brightMagenta: '\u001B[95m',
  brightBlue: '\u001B[94m',
  brightOrange: '\u001B[38;5;208m',
  white: '\u001B[37m',
});

const LEVEL_COLORS = Object.freeze({
  DEBUG: COLORS.magenta,
  INFO: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  FATAL: COLORS.red,
});

const LEVEL_ICONS = Object.freeze({
  DEBUG: '◆',
  INFO: '●',
  WARN: '▲',
  ERROR: '✖',
  FATAL: '✖',
});

const SCOPE_COLORS = Object.freeze({
  BOT: COLORS.brightYellow,
  DISCORD: COLORS.brightCyan,
  'SHARD MANAGER': COLORS.brightMagenta,
  'PLAYER PANEL': COLORS.brightGreen,
  'BLUEPRINT PANEL': COLORS.yellow,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  'DUNE API': COLORS.yellow,
  'DISCORD ADAPTER': COLORS.brightCyan,
  'DISCORD AUDIT': COLORS.brightGreen,
  'DISCORD AUDIT LOG': COLORS.brightMagenta,
  DASHBOARD: COLORS.brightOrange,
  HTTP: COLORS.brightGreen,
  STARTUP: COLORS.brightYellow,
  default: COLORS.white,
});

function formatTimestamp(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.month}/${values.day}/${values.year} ${values.hour}:${values.minute}:${values.second} ${values.dayPeriod}`;
}

export function formatLogLine(scope, level, message) {
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;
  return (
    `${COLORS.dim}[${formatTimestamp(new Date())}]${COLORS.reset} ` +
    `${LEVEL_COLORS[level]}${LEVEL_ICONS[level]} [${level}]${COLORS.reset} ` +
    `${scopeColor}[${scope}]${COLORS.reset} ` +
    message
  );
}
