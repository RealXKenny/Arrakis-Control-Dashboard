import { z } from 'zod';

export const portalWidgetIds = [
  'conditions',
  'character',
  'solaris',
  'exchange',
  'holdings',
  'fleet',
  'population',
  'landsraad',
] as const;
export type PortalWidgetId = (typeof portalWidgetIds)[number];
export const portalWidgetCatalog: Record<PortalWidgetId, { name: string; description: string }> = {
  conditions: { name: 'Field conditions', description: 'Spice reports and the Coriolis cycle for your briefing map.' },
  character: { name: 'Your character', description: 'Your character, level and current status.' },
  solaris: { name: 'Solari credit', description: 'Your personal reserves.' },
  exchange: { name: 'Exchange', description: 'Market listing and item counts.' },
  holdings: { name: 'Holdings', description: 'Your owned and shared bases.' },
  fleet: { name: 'Fleet', description: 'Your owned and shared vehicles.' },
  population: { name: 'Server rhythm', description: 'Population over the last 24 hours.' },
  landsraad: { name: 'Landsraad', description: 'The current council term and house scores.' },
};
export const portalLayoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    density: z.enum(['comfortable', 'compact']),
    widgets: z
      .array(z.enum(portalWidgetIds))
      .max(portalWidgetIds.length)
      .refine((ids) => new Set(ids).size === ids.length, 'Widgets must be unique.'),
  })
  .strict();
export type PortalLayout = z.infer<typeof portalLayoutSchema>;
export const portalLayoutRecordSchema = z
  .object({ revision: z.string().uuid().nullable(), layout: portalLayoutSchema })
  .strict();
export type PortalLayoutRecord = z.infer<typeof portalLayoutRecordSchema>;
export function recommendedPortalLayout(hasGuild: boolean): PortalLayout {
  return hasGuild
    ? { schemaVersion: 1, density: 'comfortable', widgets: [...portalWidgetIds] }
    : personalPortalLayout();
}
export function personalPortalLayout(): PortalLayout {
  return { schemaVersion: 1, density: 'compact', widgets: ['conditions', 'character', 'solaris', 'holdings', 'fleet'] };
}
