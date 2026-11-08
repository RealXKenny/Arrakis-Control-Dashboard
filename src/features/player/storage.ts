import { z } from 'zod';
import type { InventoryItem } from './inventory';

export const ALL_CONTAINERS = 'All containers';

const queryShape = z.object({
  container: z.string().trim().max(60).catch(ALL_CONTAINERS),
  q: z.string().trim().max(128).catch(''),
  layout: z.enum(['grid', 'list']).catch('grid'),
});

export type StorageQuery = z.infer<typeof queryShape>;

type SearchParams = Record<string, string | string[] | undefined>;

export function parseStorageQuery(params: SearchParams): StorageQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return queryShape.parse({
    container: first(params.container) || ALL_CONTAINERS,
    q: first(params.q) ?? '',
    layout: first(params.layout),
  });
}

export function storageHref(query: StorageQuery, overrides: Partial<StorageQuery> = {}): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.container !== ALL_CONTAINERS) params.set('container', next.container);
  if (next.q) params.set('q', next.q);
  if (next.layout !== 'grid') params.set('layout', next.layout);
  const search = params.toString();
  return search ? `/storage?${search}` : '/storage';
}

export interface StorageView {
  /** Containers with their stack counts, "All containers" first. */
  containers: Array<{ name: string; count: number }>;
  active: string;
  items: InventoryItem[];
}

/** Narrow the inventory by container and search text. An unknown container falls back to all of them. */
export function viewStorage(items: InventoryItem[], query: StorageQuery): StorageView {
  const names = [...new Set(items.map((item) => item.group))];
  const active = names.includes(query.container) ? query.container : ALL_CONTAINERS;
  const needle = query.q.toLowerCase();
  return {
    containers: [
      { name: ALL_CONTAINERS, count: items.length },
      ...names.map((name) => ({ name, count: items.filter((item) => item.group === name).length })),
    ],
    active,
    items: items.filter(
      (item) => (active === ALL_CONTAINERS || item.group === active) && item.name.toLowerCase().includes(needle),
    ),
  };
}
