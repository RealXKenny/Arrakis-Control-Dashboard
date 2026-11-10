import type { AdminOperation } from './types';

export type AdminField = {
  name: string;
  location: 'query' | 'body';
  type: 'text' | 'number' | 'boolean' | 'json' | 'password';
  optional: boolean;
  hint: string;
  choices?: string[];
};

export function fieldLabel(name: string) {
  if (name === 'q') return 'Search query';
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

// Split reference parameters without splitting enum choices or nested object descriptions.
function parameters(text: string) {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < text.length; index++) {
    if ('([{'.includes(text[index])) depth++;
    if (')]}'.includes(text[index])) depth--;
    if (text[index] === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const booleans =
  /^(enabled|online|recentOnly|onlyEligible|includeNpcBroker|apply|applyNow|restart|deferRestart|restoreDefaults|fresh|modeChanged|memoryChanged|is_spawning_active|safetyBackups)$/;
const numbers =
  /^(page|pageSize|limit|quantity|amount|points|level|durability|quality|grade|augmentQuality|x|y|z|yaw|offset|memory|notifyMinutes|intervalMinutes|intervalHours|retentionDays|durationSec|delayMinutes|inactiveWeeks|hours|thresholdPercent|windtrapThresholdPercent|waterThresholdPercent|waterIntervalHours|goalAmount|threshold|newThreshold|rank|roleId|count|perServerGiB|poolGiB|swappiness|alwaysOnStartupParallelism|max_globally_active|max_globally_primed|global_spawn_weight|priceMultiplier|augmentMultiplier|rankedArmorMultiplier|rankedWeaponMultiplier|buybackPercent|maxBuys|defaultCountdownMinutes|broadcastDurationSec|recoveryGraceMinutes)$/;
const jsonFields = /^(items|entries|updates|values|settings|messages|overrides|newItems|commodityStacks|offset)$/;
const enums: Record<string, string[]> = {
  sortDirection: ['asc', 'desc'],
  onConflict: ['overwrite', 'rename'],
  identityMode: ['adopt-backup', 'keep-current'],
  auditLogMode: ['adopt-backup', 'keep-current'],
  augmentPricing: ['discounted', 'original'],
  party: ['all', 'player', 'bot', 'npc'],
};

export function operationFields(operation: AdminOperation): AdminField[] {
  if (/^(None\b|Various options|Config object|[a-z-]+:(read|write)\b)/i.test(operation.parameters)) {
    return operation.confirmationPhrases.length
      ? [
          {
            name: 'confirmation',
            location: 'body',
            type: 'text',
            optional: false,
            hint: operation.confirmationPhrases.join(' or '),
          },
        ]
      : [];
  }
  const defaultLocation = /^(query:)/i.test(operation.parameters) || operation.method === 'GET' ? 'query' : 'body';
  const fields: AdminField[] = [];
  for (const part of parameters(operation.parameters.replace(/^(body:|query:|multipart form:|multipart:)\s*/i, ''))) {
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*(?:\|[A-Za-z][A-Za-z0-9_]*)?)(\[\])?(\?)?/.exec(part);
    if (!match || /^(None|Various|Config|body|same)$/.test(match[1])) continue;
    for (const name of match[1].split('|')) {
      if (
        operation.pathParameters.includes(name) ||
        operation.files?.includes(name) ||
        fields.some((field) => field.name === name)
      )
        continue;
      const hint =
        name === 'confirmation' && operation.confirmationPhrases.length
          ? operation.confirmationPhrases.join(' or ')
          : part.slice(match[0].length).trim();
      const type = /token|passphrase|password/i.test(name)
        ? 'password'
        : match[2] || jsonFields.test(name)
          ? 'json'
          : booleans.test(name) || /\bboolean\b/.test(hint)
            ? 'boolean'
            : numbers.test(name) || /\bnumber\b/.test(hint)
              ? 'number'
              : 'text';
      let choices = enums[name];
      if (name === 'status' && operation.route === '/api/players') choices = ['all', 'online', 'offline', 'banned'];
      if (name === 'mode' && operation.route === '/api/server/config') choices = ['public', 'local'];
      fields.push({
        name,
        location: /\bquery\b/.test(hint) ? 'query' : defaultLocation,
        type,
        optional: !!match[3] || match[1].includes('|') || /optional/.test(hint),
        hint,
        ...(choices ? { choices } : {}),
      });
    }
  }
  return fields;
}

export function fieldValue(field: AdminField, text: string): unknown {
  if (!text.trim()) return undefined;
  if (field.type === 'json') return JSON.parse(text);
  if (field.type === 'boolean') return text === 'true';
  if (field.type === 'number') {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`${fieldLabel(field.name)} must be a finite number.`);
    // Keep unsafe-size integer quantities intact, just like identifiers.
    return Number.isInteger(value) && !Number.isSafeInteger(value) ? text : value;
  }
  return text;
}

export function defaultQuery(operation: AdminOperation) {
  return operationFields(operation).some((field) => field.name === 'pageSize' && field.location === 'query')
    ? { page: 0, pageSize: 20 }
    : {};
}

export function resultRows(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  for (const name of [
    'rows',
    'players',
    'members',
    'guilds',
    'bases',
    'vehicles',
    'items',
    'backups',
    'services',
    'data',
  ]) {
    if (Array.isArray(data[name])) return resultRows(data[name]);
  }
  if (data.data && typeof data.data === 'object') return resultRows(data.data);
  return null;
}

export function resultHasNext(value: unknown, page: number, pageSize: number) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.hasMore === 'boolean') return record.hasMore;
    if (typeof record.total === 'number' && Number.isSafeInteger(record.total))
      return (page + 1) * pageSize < record.total;
  }
  return (resultRows(value)?.length ?? 0) >= pageSize;
}

export function rowContext(operation: AdminOperation, row: Record<string, unknown>, path: Record<string, string>) {
  const result = { ...path };
  const route = operation.route;
  const kind = /\/members$/.test(route)
    ? 'player'
    : /\/(?:inventory|items)$/.test(route) && !route.startsWith('/api/exchange')
      ? 'item'
      : /\/vehicles/.test(route)
        ? 'vehicle'
        : /\/bases/.test(route)
          ? 'base'
          : /\/guilds/.test(route)
            ? 'guild'
            : /\/blueprints/.test(route)
              ? 'blueprint'
              : /\/storage/.test(route)
                ? 'storage'
                : /\/players/.test(route)
                  ? 'player'
                  : null;
  if (kind) {
    const value =
      row[`${kind}_id`] ?? row[`${kind}Id`] ?? (kind === 'player' ? (row.pawnId ?? row.pawn_id) : undefined) ?? row.id;
    if (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)))
      result[`${kind}Id`] = String(value);
  }
  return result;
}
