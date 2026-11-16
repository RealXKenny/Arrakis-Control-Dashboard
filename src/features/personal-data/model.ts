import { z } from 'zod';
import { taskRecordSchema } from '../tasks/model';
import { privacyRecordSchema } from '../privacy/model';
import { activityRecordSchema } from '../activity-views/model';
export const dataScopes = ['tasks', 'sharing', 'views'] as const;
export type DataScope = (typeof dataScopes)[number];
export const dataScopeLabels: Record<DataScope, string> = {
  tasks: 'Notes and plans',
  sharing: 'Sharing drafts and snapshots',
  views: 'Saved activity views',
};
export const scopeSummarySchema = z
  .object({
    scope: z.enum(dataScopes),
    revision: z.uuid().nullable(),
    entries: z.number().int().min(0).max(100),
    snapshots: z.number().int().min(0).max(4),
  })
  .strict();
export type ScopeSummary = z.infer<typeof scopeSummarySchema>;
export const dataSummarySchema = z
  .object({
    checkedAt: z.iso.datetime(),
    scopes: z
      .array(scopeSummarySchema)
      .length(3)
      .refine((values) => new Set(values.map((v) => v.scope)).size === 3),
  })
  .strict();
export type DataSummary = z.infer<typeof dataSummarySchema>;
const selection = z.object({ scope: z.enum(dataScopes), revision: z.uuid().nullable() }).strict();
export const exportInputSchema = z
  .object({
    selection: z
      .array(selection)
      .min(1)
      .max(3)
      .refine((values) => new Set(values.map((v) => v.scope)).size === values.length),
  })
  .strict();
export const eraseInputSchema = selection.extend({ confirmation: z.literal('DELETE MY DATA') }).strict();
export const dataExportSchema = z
  .object({
    format: z.literal('arrakis-personal-data'),
    schemaVersion: z.literal(1),
    exportedAt: z.iso.datetime(),
    records: z
      .array(
        z.discriminatedUnion('scope', [
          z.object({ scope: z.literal('views'), data: activityRecordSchema }).strict(),
          z
            .object({
              scope: z.literal('tasks'),
              data: taskRecordSchema,
            })
            .strict(),
          z
            .object({
              scope: z.literal('sharing'),
              data: privacyRecordSchema.omit({ shareId: true }),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(3),
  })
  .strict();
export const erasureResultSchema = z.object({ checkedAt: z.iso.datetime(), erased: scopeSummarySchema }).strict();
