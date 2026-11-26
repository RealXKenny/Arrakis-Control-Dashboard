import { z } from 'zod';

export const GUILD_BASE_LIMIT = 50;
export const guildBaseMaps = ['hagga-basin', 'deep-desert'] as const;
export const guildBasePurposes = ['headquarters', 'storage', 'crafting', 'staging', 'outpost', 'other'] as const;
export const guildBaseMapLabel = { 'hagga-basin': 'Hagga Basin', 'deep-desert': 'Deep Desert' };
export const guildBasePurposeLabel = {
  headquarters: 'Headquarters',
  storage: 'Storage',
  crafting: 'Crafting',
  staging: 'Staging',
  outpost: 'Outpost',
  other: 'Other',
};
export const directoryGuildIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const guildBaseDraftSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    map: z.enum(guildBaseMaps),
    purpose: z.enum(guildBasePurposes),
    location: z.string().trim().min(1).max(250),
    contact: z.string().trim().min(1).max(200),
    accessInstructions: z.string().trim().min(1).max(1000),
    notes: z.string().trim().max(1500),
  })
  .strict();
export const guildBaseEntrySchema = z.object({
  ...guildBaseDraftSchema.shape,
  revision: z.uuid(),
  status: z.enum(['active', 'archived']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  updatedByName: z.string().min(1).max(200),
});
export const baseDirectoryViewSchema = z.object({
  canEdit: z.boolean(),
  entries: z.array(guildBaseEntrySchema).max(GUILD_BASE_LIMIT),
});
export const baseDirectoryInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), entry: guildBaseDraftSchema }).strict(),
  z
    .object({ action: z.literal('status'), id: z.uuid(), revision: z.uuid(), status: z.enum(['active', 'archived']) })
    .strict(),
  z.object({ action: z.literal('delete'), id: z.uuid(), revision: z.uuid() }).strict(),
]);
export type GuildBaseDraft = z.infer<typeof guildBaseDraftSchema>;
export type GuildBaseEntry = z.infer<typeof guildBaseEntrySchema>;
export type BaseDirectoryView = z.infer<typeof baseDirectoryViewSchema>;
export type BaseDirectoryInput = z.infer<typeof baseDirectoryInputSchema>;

/** Search stays in the authorized browser; location and access text never become URL query parameters. */
export function filterGuildBases(
  entries: GuildBaseEntry[],
  query: string,
  map: string,
  purpose: string,
  status: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter(
    (entry) =>
      entry.status === status &&
      (!map || entry.map === map) &&
      (!purpose || entry.purpose === purpose) &&
      (!needle ||
        [entry.name, entry.location, entry.contact, entry.notes, entry.accessInstructions].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        )),
  );
}
