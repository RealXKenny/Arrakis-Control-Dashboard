import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { getDuneClient } from '../../../server/integrations/dune';
import { getLinkedPlayer } from './linked-player';
import { AppError } from '../../../lib/errors';
import { spendReadBudget } from '../../../server/read-budget';
import { record } from '../inventory';
import type { FinderResult, FinderSource } from '../item-finder';

const MAX_ASSETS = 20;
const MAX_CONTAINERS = 80;
const MAX_STACKS = 5000;
const MAX_RESULTS = 200;
const text = (value: unknown, fallback = 'Unknown'): string =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 200)
    : typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
      ? String(value)
      : fallback;
const id = (value: unknown): string | null => {
  const candidate = text(value, '');
  return /^[1-9][0-9]{0,15}$/.test(candidate) && Number.isSafeInteger(Number(candidate)) ? candidate : null;
};
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Unsupported response');
  return value;
}
function supported(value: unknown): Record<string, unknown> {
  const data = record(value);
  if (data.supported === false || data.found === false || data.ok === false) throw new Error('Unavailable source');
  return data;
}
function rosterRank(value: unknown, controller: string): number | null {
  const data = supported(value);
  if (data.claimed === false) return null;
  const entry = array(data.entries)
    .map(record)
    .find((row) => row.playerId === controller && row.canonical === true);
  return entry && [1, 2, 3].includes(Number(entry.rank)) ? Number(entry.rank) : null;
}

/** Fresh session-linked reads only. Names, list filters and caller IDs never authorize an asset. */
export async function findItems(
  session: DashboardSession,
  query: string,
  callerSignal?: AbortSignal,
): Promise<FinderResult> {
  if (!query.trim() || query.length > 128)
    throw new AppError('Enter 1–128 search characters.', 400, 'INVALID_QUERY', true);
  const budget = await spendReadBudget();
  if (!budget.allowed) throw new AppError('Search capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  const result: FinderResult = { items: [], sources: [], limited: false, startedAt: new Date().toISOString() };
  const client = getDuneClient();
  const read = async (path: string) => {
    signal.throwIfAborted();
    return client.request('GET', path, { timeoutMs: 4000, retryRead: false, signal });
  };
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
  let inspected = 0;
  let containers = 0;
  const status = (name: string, state: FinderSource['status'], detail: string) => {
    result.sources.push({ name, status: state, detail, checkedAt: new Date().toISOString() });
  };
  const add = (value: unknown, location: string, href: string, personal = false) => {
    const values = array(value);
    for (const raw of values) {
      if (++inspected > MAX_STACKS) {
        result.limited = true;
        break;
      }
      const row = record(raw);
      const template = text(row.templateId ?? row.template_id, '');
      const name = text(row.name ?? row.display_name ?? row.item_name, template || 'Unknown');
      const needle = query.trim().toLowerCase();
      if (!name.toLowerCase().includes(needle) && !template.toLowerCase().includes(needle)) continue;
      if (result.items.length >= MAX_RESULTS) {
        result.limited = true;
        continue;
      }
      const group = personal
        ? ({ '0': 'Backpack', '1': 'Character gear', '15': 'Loadout', '30': 'Schematics' } as Record<string, string>)[
            String(row.inventory_type)
          ]
        : null;
      if (personal && !group) continue;
      const slot = row.positionIndex ?? row.position_index;
      const inventory = text(row.inventoryId ?? row.inventory_id, 'Not reported');
      result.items.push({
        id: `${location}:${text(row.itemId ?? row.id)}:${result.items.length}`,
        name,
        quantity: text(row.quantity ?? row.stack_size),
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
  await source('Character inventory', async () => {
    const data = supported(await read(`/api/players/${player}/inventory`));
    add(data.rows, 'Character', '/storage', true);
  });
  for (const kind of ['bases', 'vehicles'] as const) {
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
      ].filter(([key]) => key !== null);
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
            add(
              array(cargo.slots).map((slot) => ({ ...record(slot), inventoryId: cargo.inventoryId })),
              name,
              `/vehicles?view=${rank === 1 ? 'owned' : 'shared'}#vehicle-${assetId}`,
            );
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
              // Validate every inventory before counting any rows from this source.
              const items = array(slots.inventories).flatMap((raw) => {
                const inventory = record(raw);
                return array(inventory.slots).map((slot) => ({ ...record(slot), inventoryId: inventory.inventoryId }));
              });
              add(items, location, `/holdings?view=${rank === 1 ? 'owned' : 'shared'}#base-${assetId}`);
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
      'At most 20 bases, 20 vehicles, 80 containers, 5,000 stacks and 200 matches; results are partial.',
    );
  return result;
}
