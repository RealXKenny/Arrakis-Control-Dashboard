import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { spendReadBudget } from '../../../server/read-budget';
import { AppError } from '../../../lib/errors';
import { record } from '../../player/inventory';
import { array, id, rosterRank, supported, text } from '../../player/server/item-finder';

export interface BaseContainer {
  containerId: string;
  name: string;
}
export interface BaseContainerReading {
  baseId: string;
  containers: BaseContainer[];
  /** Containers omitted because the current character lacks verified access or the ID is unsupported. */
  omitted: number;
  limited: boolean;
  checkedAt: string;
}
const MAX_CONTAINERS = 80;

/**
 * N024: list only containers the freshly linked character can open, using the same canonical roster and
 * per-container access checks as the item finder. Contents are never read here.
 */
export async function listBaseContainers(
  baseId: string,
  character: { controller: string; player: string },
  signal?: AbortSignal,
): Promise<BaseContainerReading> {
  if (!id(baseId)) throw new AppError('Choose a supported base.', 400, 'INVALID_BASE', true);
  const budget = await spendReadBudget();
  if (!budget.allowed) throw new AppError('Read capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const client = getDuneClient();
  const read = (path: string) => {
    deadline.throwIfAborted();
    return client.request('GET', path, { timeoutMs: 4000, retryRead: false, signal: deadline });
  };
  try {
    const listed = supported(await read(`/api/players/${character.player}/bases`));
    if (!array(listed.rows).some((value) => id(record(value).id ?? record(value).base_id) === baseId))
      throw new AppError('That base is not in your current base list.', 403, 'BASE_FORBIDDEN', true);
    const rank = rosterRank(await read(`/api/bases/${baseId}/permissions`), character.controller);
    if (rank === null)
      throw new AppError('Your character has no current permission on that base.', 403, 'BASE_FORBIDDEN', true);
    const access = supported(await read(`/api/bases/${baseId}/child-access`));
    const allowed = new Set(
      array(access.rows)
        .map(record)
        .filter((row) => {
          const level = Number(row.currentAccess);
          return Number.isInteger(level) && level >= rank && level <= 5;
        })
        .map((row) => id(row.actorId)),
    );
    const inventory = supported(await read(`/api/bases/${baseId}/inventory`));
    const rows = array(inventory.containers).map(record);
    const containers: BaseContainer[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const containerId = id(row.placeableId);
      if (!containerId || !allowed.has(containerId) || seen.has(containerId)) continue;
      seen.add(containerId);
      if (containers.length < MAX_CONTAINERS)
        containers.push({ containerId, name: text(row.name || row.typeName, 'Container') });
    }
    return {
      baseId,
      containers,
      omitted: rows.length - seen.size,
      limited: seen.size > MAX_CONTAINERS,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Dev note: a locked chest stays locked, even when the Console is having a sandstorm.
    throw new AppError(
      deadline.aborted ? 'Container check cancelled or timed out.' : 'Base containers could not be verified.',
      503,
      'CONTAINERS_UNAVAILABLE',
      true,
    );
  }
}
