import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { getDuneClient } from '../../../server/integrations/dune';
import { getLinkedPlayer } from './linked-player';
import { AppError } from '../../../lib/errors';
import { spendReadBudget } from '../../../server/read-budget';
import { record } from '../inventory';
import type { FinderResult, FinderSource, FoundItem } from '../item-finder';
import type { InventoryObservation, ObservedItem } from '../equipment';

const MAX_ASSETS = 20;
const MAX_CONTAINERS = 80;
const MAX_STACKS = 5000;
const MAX_RESULTS = 200;
const MAX_REPORTED_SLOTS = 10_000;
// Only exact integer slot capacities count as verified; volume or weight fields are a different measure.
const slotCapacity = (value: Record<string, unknown>): number | null => {
  for (const candidate of [value.maxSlots, value.max_slots, value.slotCount, value.slot_count]) {
    const number = typeof candidate === 'string' && /^[0-9]{1,5}$/.test(candidate) ? Number(candidate) : candidate;
    if (typeof number === 'number' && Number.isInteger(number) && number > 0 && number <= MAX_REPORTED_SLOTS)
      return number;
  }
  return null;
};
const occupied = (rows: unknown[]) =>
  rows.filter((raw) => {
    const row = record(raw);
    return [row.itemId, row.id, row.templateId, row.template_id].some(
      (value) => value !== undefined && value !== null && value !== '',
    );
  }).length;
export const text = (value: unknown, fallback = 'Unknown'): string =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 200)
    : typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
      ? String(value)
      : fallback;
// Exact values must become unknown when oversized, never a different truncated quantity or identity.
const exactText = (value: unknown, fallback = 'Unknown'): string =>
  typeof value === 'string' && value.trim().length > 200 ? fallback : text(value, fallback);
export const id = (value: unknown): string | null => {
  const candidate = text(value, '');
  return /^[1-9][0-9]{0,15}$/.test(candidate) && Number.isSafeInteger(Number(candidate)) ? candidate : null;
};
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Unsupported response');
  return value;
}
export function supported(value: unknown): Record<string, unknown> {
  const data = record(value);
  if (data.supported === false || data.found === false || data.ok === false) throw new Error('Unavailable source');
  return data;
}
export function rosterRank(value: unknown, controller: string): number | null {
  const data = supported(value);
  if (data.claimed === false) return null;
  const entry = array(data.entries)
    .map(record)
    .find((row) => row.playerId === controller && row.canonical === true);
  return entry && [1, 2, 3].includes(Number(entry.rank)) ? Number(entry.rank) : null;
}

export async function resolveItemCharacter(session: DashboardSession) {
  const linked = await getLinkedPlayer(
    {
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds ?? [],
      interactionId: `finder-${Date.now()}`,
      commandName: 'portal',
    },
    { timeout: 4000 },
  );
  const player = id(linked.pawnId ?? linked.controllerId);
  const controller = id(linked.controllerId);
  if (!linked.linked || !player || !controller)
    throw new AppError('Link a character with a verified controller first.', 403, 'UNLINKED', true);
  return { player, controller };
}

/** Fresh session-linked reads only. Names, list filters and caller IDs never authorize an asset. */
type Selection = { templates: string[] | null; controller: string; player: string; baseId?: string };
async function scanItems(
  session: DashboardSession,
  query: string,
  callerSignal?: AbortSignal,
  selection?: Selection,
): Promise<InventoryObservation> {
  if (!selection && (!query.trim() || query.length > 128))
    throw new AppError('Enter 1–128 search characters.', 400, 'INVALID_QUERY', true);
  const budget = await spendReadBudget();
  if (!budget.allowed) throw new AppError('Search capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  const result: InventoryObservation = {
    items: [],
    containers: [],
    sources: [],
    limited: false,
    startedAt: new Date().toISOString(),
  };
  const client = getDuneClient();
  const read = async (path: string) => {
    signal.throwIfAborted();
    return client.request('GET', path, { timeoutMs: 4000, retryRead: false, signal });
  };
  const { player, controller } = await resolveItemCharacter(session);
  if (selection && (controller !== selection.controller || player !== selection.player))
    throw new AppError('Your character link changed. Refresh pinned items.', 409, 'CHARACTER_CHANGED', true);
  const resultLimit = selection ? MAX_STACKS : MAX_RESULTS;
  const selected = selection?.templates ? new Set(selection.templates.map((template) => template.toLowerCase())) : null;
  const countedStacks = new Set<string>();
  let stackWarning = false;
  let templateWarning = false;
  let inspected = 0;
  let containers = 0;
  const status = (name: string, state: FinderSource['status'], detail: string) => {
    result.sources.push({ name, status: state, detail, checkedAt: new Date().toISOString() });
  };
  const add = (
    value: unknown,
    location: string,
    href: string,
    origin: { kind: ObservedItem['sourceKind']; key: string; label: string },
  ) => {
    const personal = origin.kind === 'character';
    const values = array(value);
    for (const raw of values) {
      if (++inspected > MAX_STACKS) {
        result.limited = true;
        break;
      }
      const row = record(raw);
      const template = exactText(row.templateId ?? row.template_id, '');
      const name = text(row.name ?? row.display_name ?? row.item_name, template || 'Unknown');
      const needle = query.trim().toLowerCase();
      if (selection && !template) {
        result.limited = true;
        if (!templateWarning) {
          status(
            'Item identity',
            'excluded',
            'Items with missing template IDs could not be classified for counters or plans.',
          );
          templateWarning = true;
        }
        continue;
      }
      if (
        selection
          ? selected !== null && !selected.has(template.toLowerCase())
          : !name.toLowerCase().includes(needle) && !template.toLowerCase().includes(needle)
      )
        continue;
      if (result.items.length >= resultLimit) {
        result.limited = true;
        continue;
      }
      const group = personal
        ? ({ '0': 'Backpack', '1': 'Character gear', '15': 'Loadout', '30': 'Schematics' } as Record<string, string>)[
            String(row.inventory_type)
          ]
        : null;
      if (personal && !group) continue;
      if (selection) {
        const stackId = exactText(row.itemId ?? row.id, '');
        if (!stackId || countedStacks.has(stackId)) {
          result.limited = true;
          if (!stackWarning) {
            status(
              'Stack identity',
              'excluded',
              'Repeated or missing stack IDs were omitted from counters and plans. Items may have moved during the scan.',
            );
            stackWarning = true;
          }
          continue;
        }
        countedStacks.add(stackId);
      }
      const slot = row.positionIndex ?? row.position_index;
      const inventory = text(row.inventoryId ?? row.inventory_id, 'Not reported');
      result.items.push({
        id: `${location}:${text(row.itemId ?? row.id)}:${result.items.length}`,
        name,
        templateId: template,
        quantity: exactText(row.quantity ?? row.stack_size),
        grade: text(row.qualityLevel ?? row.quality_level ?? row.quality),
        durability: `${text(row.currentDurability ?? row.current_durability)} / ${text(row.maxDurability ?? row.max_durability)}`,
        augments: Array.isArray(row.augments)
          ? row.augments.slice(0, 20).map((augment) => {
              if (typeof augment === 'string' || typeof augment === 'number') return text(augment);
              const a = record(augment);
              return `${text(a.name ?? a.templateId)} (grade ${text(a.qualityLevel)})`;
            })
          : [],
        location: `${location}${group ? ` · ${group}` : ''} · inventory ${inventory} · slot ${text(slot, 'Not reported')}`,
        href,
        sourceKind: origin.kind,
        container: origin.label,
        containerKey: origin.key,
        group: group ?? null,
      });
    }
  };
  const source = async (name: string, action: () => Promise<void>) => {
    try {
      const before = result.sources.length;
      await action();
      if (!result.sources.slice(before).some((entry) => entry.name === name))
        status(name, 'ok', 'Fresh read; not a historical or live guarantee.');
    } catch {
      status(
        name,
        'unavailable',
        signal.aborted
          ? 'Search cancelled or deadline reached.'
          : 'Unsupported, inaccessible or failed source; no items counted.',
      );
    }
  };
  // A single worker pool bounds provider load, including per-container detail requests.
  const work = async (values: unknown[], action: (value: unknown) => Promise<void>) => {
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, values.length) }, async () => {
        while (cursor < values.length && !signal.aborted) await action(values[cursor++]);
      }),
    );
    if (cursor < values.length) result.limited = true;
  };
  const baseOnly = selection?.baseId ?? null;
  if (!baseOnly)
    await source('Character inventory', async () => {
      const data = supported(await read(`/api/players/${player}/inventory`));
      add(data.rows, 'Character', '/storage', { kind: 'character', key: 'character', label: 'Character' });
    });
  for (const kind of baseOnly ? (['bases'] as const) : (['bases', 'vehicles'] as const)) {
    await source(kind === 'bases' ? 'Base discovery' : 'Vehicle discovery', async () => {
      const data = supported(await read(`/api/players/${player}/${kind}`));
      const values = Array.isArray(data.rows) ? data.rows : [];
      if (!Array.isArray(data.rows)) throw new Error('Missing list');
      if (
        values.length > MAX_ASSETS ||
        Number(data.totalCount) > values.length ||
        (kind === 'vehicles' && values.length >= 200)
      )
        result.limited = true;
      if (
        values.slice(0, MAX_ASSETS).some((value) => {
          const row = record(value);
          return id(row.id ?? row.base_id ?? row.vehicle_id) === null;
        })
      ) {
        result.limited = true;
        status(
          kind === 'bases' ? 'Base discovery' : 'Vehicle discovery',
          'excluded',
          'Assets with missing or unsupported IDs were excluded.',
        );
      }
      const unique = [
        ...new Map(
          values.slice(0, MAX_ASSETS).map((value) => {
            const row = record(value);
            return [id(row.id ?? row.base_id ?? row.vehicle_id), row] as const;
          }),
        ).entries(),
      ].filter(([key]) => key !== null && (!baseOnly || key === baseOnly));
      if (baseOnly && !unique.length) {
        result.limited = true;
        status(
          kind === 'bases' ? 'Base discovery' : 'Vehicle discovery',
          'excluded',
          'The selected base is not in your current base list.',
        );
      }
      await work(unique, async (value) => {
        const [assetId, asset] = value as [string, Record<string, unknown>];
        const name = `${kind === 'bases' ? 'Base' : 'Vehicle'} ${text(asset.name)} #${assetId}`;
        await source(name, async () => {
          const rank = rosterRank(await read(`/api/${kind}/${assetId}/permissions`), controller);
          if (rank === null) {
            status(name, 'excluded', 'No current canonical character permission.');
            return;
          }
          if (kind === 'vehicles') {
            const cargo = supported(await read(`/api/vehicles/${assetId}/storage`));
            const href = `/vehicles?view=${rank === 1 ? 'owned' : 'shared'}#vehicle-${assetId}`;
            const slots = array(cargo.slots);
            const origin = { kind: 'vehicle' as const, key: `vehicle:${assetId}`, label: `${text(asset.name)} cargo` };
            add(
              slots.map((slot) => ({ ...record(slot), inventoryId: cargo.inventoryId })),
              name,
              href,
              origin,
            );
            result.containers.push({
              key: origin.key,
              label: origin.label,
              location: name,
              href,
              sourceKind: 'vehicle',
              usedSlots: occupied(slots),
              maxSlots: slotCapacity(cargo),
            });
            return;
          }
          const access = supported(await read(`/api/bases/${assetId}/child-access`));
          const allowed = new Set(
            array(access.rows)
              .map(record)
              .filter((row) => {
                const level = Number(row.currentAccess);
                return Number.isInteger(level) && level >= rank && level <= 5;
              })
              .map((row) => id(row.actorId)),
          );
          const inventory = supported(await read(`/api/bases/${assetId}/inventory`));
          const candidates = array(inventory.containers)
            .map(record)
            .filter((row) => {
              const containerId = id(row.placeableId);
              return containerId !== null && allowed.has(containerId);
            });
          if (candidates.length < array(inventory.containers).length)
            status(name, 'excluded', 'Restricted or unverifiable containers omitted.');
          // Nested details are sequential so the outer three workers remain the global concurrency bound.
          for (const container of candidates) {
            if (++containers > MAX_CONTAINERS || signal.aborted) {
              result.limited = true;
              break;
            }
            const containerId = id(container.placeableId)!;
            const location = `${name} · ${text(container.name || container.typeName)} #${containerId}`;
            await source(location, async () => {
              const slots = supported(await read(`/api/bases/${assetId}/containers/${containerId}`));
              const inventories = array(slots.inventories).map(record);
              // Validate every inventory before counting any rows from this source.
              const items = inventories.flatMap((inventory) =>
                array(inventory.slots).map((slot) => ({ ...record(slot), inventoryId: inventory.inventoryId })),
              );
              const href = `/holdings?view=${rank === 1 ? 'owned' : 'shared'}#base-${assetId}`;
              const label = text(container.name || container.typeName);
              const key = `base:${assetId}:${containerId}`;
              add(items, location, href, { kind: 'base', key, label });
              const capacities = inventories.map(slotCapacity);
              result.containers.push({
                key,
                label,
                location,
                href,
                sourceKind: 'base',
                usedSlots: occupied(items),
                // Dev note: a container that will not tell us its size gets no benefit of the doubt, like a stillsuit with a leak.
                maxSlots:
                  inventories.length > 0 && capacities.every((value) => value !== null)
                    ? capacities.reduce<number>((sum, value) => sum + value!, 0)
                    : null,
              });
            });
          }
        });
      });
    });
  }
  if (inspected > MAX_STACKS) result.limited = true;
  if (result.limited)
    status(
      'Search limits',
      'limited',
      `At most 20 bases, 20 vehicles, 80 containers, 5,000 stacks and ${resultLimit} matches; results are partial.`,
    );
  return result;
}

const publicItem = ({
  sourceKind: _kind,
  container: _container,
  containerKey: _key,
  group: _group,
  ...item
}: ObservedItem): FoundItem => item;
export async function findItems(session: DashboardSession, query: string, signal?: AbortSignal): Promise<FinderResult> {
  const { containers: _containers, items, ...rest } = await scanItems(session, query, signal);
  return { ...rest, items: items.map(publicItem) };
}

/** Every authorized stack for server-side equipment planning; callers return only derived views. */
export function collectInventory(
  session: DashboardSession,
  character: { controller: string; player: string },
  signal?: AbortSignal,
): Promise<InventoryObservation> {
  return scanItems(session, '', signal, { templates: null, ...character });
}

/** Only server-owned saved pins select this larger, still stack-bounded collection. */
export function collectPinnedItems(
  session: DashboardSession,
  templates: string[],
  character: { controller: string; player: string },
  signal?: AbortSignal,
) {
  if (!templates.length || templates.length > 12)
    throw new AppError('Choose 1–12 pinned items.', 400, 'INVALID_PINS', true);
  return scanItems(session, '', signal, { templates, ...character }).then(
    ({ containers: _containers, items, ...rest }): FinderResult => ({ ...rest, items: items.map(publicItem) }),
  );
}

/** N025: one freshly authorised base only, with the same permission, container and stack bounds. */
export async function collectBaseItems(
  session: DashboardSession,
  baseId: string,
  templates: string[],
  character: { controller: string; player: string },
  signal?: AbortSignal,
): Promise<FinderResult> {
  if (!id(baseId)) throw new AppError('Choose a supported base.', 400, 'INVALID_BASE', true);
  if (!templates.length || templates.length > 12)
    throw new AppError('Choose 1–12 stockpile items.', 400, 'INVALID_MINIMUMS', true);
  const {
    containers: _containers,
    items,
    ...rest
  } = await scanItems(session, '', signal, {
    templates,
    ...character,
    baseId,
  });
  return { ...rest, items: items.map(publicItem) };
}
