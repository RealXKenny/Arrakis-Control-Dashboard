import { z } from 'zod';
import type { NavigationItem } from '../../components/navigation/nav-config';

export function navigationCommands(items: readonly NavigationItem[], query: string) {
  const found: { id: string; label: string; detail: string; href: string }[] = [];
  const seen = new Set<string>();
  const visit = (rows: readonly NavigationItem[], parent = '') => {
    for (const row of rows) {
      if (row.href && !seen.has(row.href)) {
        seen.add(row.href);
        const detail = [parent, row.description].filter(Boolean).join(' · ');
        if (`${row.label} ${detail}`.toLowerCase().includes(query.trim().toLowerCase()))
          found.push({ id: row.id, label: row.label, detail, href: row.href });
      }
      if (row.children) visit(row.children, [parent, row.label].filter(Boolean).join(' / '));
    }
  };
  visit(items);
  return found.slice(0, 60);
}
export const assetQuerySchema = z.string().trim().min(1).max(80);
export const assetLookupSchema = z
  .object({
    checkedAt: z.iso.datetime(),
    partial: z.boolean(),
    assets: z
      .array(
        z
          .object({
            id: z.string().regex(/^[1-9][0-9]{0,15}$/),
            name: z.string().min(1).max(120),
            kind: z.enum(['base', 'vehicle']),
            access: z.enum(['owned', 'shared']),
            href: z
              .string()
              .regex(
                /^\/(?:holdings\?view=(?:owned|shared)#base-|vehicles\?view=(?:owned|shared)#vehicle-)[1-9][0-9]{0,15}$/,
              ),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type AssetLookup = z.infer<typeof assetLookupSchema>;
