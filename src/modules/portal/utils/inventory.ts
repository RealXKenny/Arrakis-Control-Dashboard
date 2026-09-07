export type DataRow = Record<string, unknown>;
export function record(value: unknown): DataRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as DataRow) : {};
}
export function rows(value: unknown): DataRow[] | null {
  const response = record(value);
  if (response.supported === false) return null;
  const list = Array.isArray(value) ? value : response.rows;
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object').map(record) : null;
}
export function label(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : fallback;
}
export type InventoryItem = { id: string; name: string; group: string; quantity: string; grade: string };
export function inventoryItems(value: unknown): InventoryItem[] | null {
  return (
    rows(value)?.map((item, index) => ({
      id: label(item.item_id ?? item.id, String(index)),
      name: label(item.display_name ?? item.item_name ?? item.name ?? item.template_id, 'Unknown item'),
      group:
        ({ '0': 'Backpack', '1': 'Character gear', '15': 'Loadout', '30': 'Schematics' } as Record<string, string>)[
          String(item.inventory_type)
        ] ?? label(item.inventory_type, 'Inventory'),
      quantity: label(item.stack_size ?? item.quantity ?? item.stack_count ?? item.count),
      grade: label(item.quality_level ?? item.quality),
    })) ?? null
  );
}

export function journeySummary(value: unknown): { name: string; completed: number; total: number }[] | null {
  const response = record(value);
  if (response.supported === false) return null;
  const groups = record(response.rows);
  if (!Object.keys(groups).length) return null;
  return ['story', 'contract', 'codex', 'tutorial'].flatMap((name) => {
    const entries = rows(groups[name]);
    return entries
      ? [{ name, completed: entries.filter((entry) => entry.complete === true).length, total: entries.length }]
      : [];
  });
}
