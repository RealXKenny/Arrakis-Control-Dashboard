import { z } from 'zod';
export const privacyCategories = ['profile', 'location', 'crafting', 'supply'] as const;
export type PrivacyCategory = (typeof privacyCategories)[number];
export const privacyNames: Record<PrivacyCategory, string> = {
  profile: 'Profile',
  location: 'Location',
  crafting: 'Crafting',
  supply: 'Supply',
};
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) =>
        [...s].every((c) => {
          const n = c.codePointAt(0)!;
          return n < 0xd800 || n > 0xdfff;
        }),
      'Use valid Unicode text.',
    );
const profileSchema = z.object({ displayName: text(80), about: text(600) }).strict();
const locationSchema = z
  .object({ map: z.enum(['Hagga Basin', 'Deep Desert', 'Other']), directions: text(400), note: text(300) })
  .strict();
const craftingSchema = z
  .object({
    specialties: z
      .array(text(48).refine((s) => s.length > 0))
      .max(10)
      .refine((values) => new Set(values.map((s) => s.toLowerCase())).size === values.length),
    details: text(600),
    contact: text(120),
  })
  .strict();
const supplySchema = z
  .object({
    offers: z
      .array(
        z
          .object({
            item: text(80).refine((s) => s.length > 0),
            quantity: z.string().regex(/^(?:|[1-9]\d{0,17})$/),
            unit: text(24),
          })
          .strict(),
      )
      .max(8)
      .refine((offers) => new Set(offers.map((o) => o.item.toLowerCase())).size === offers.length),
    details: text(400),
    contact: text(120),
  })
  .strict();
export const privacyDraftsSchema = z
  .object({ profile: profileSchema, location: locationSchema, crafting: craftingSchema, supply: supplySchema })
  .strict();
export type PrivacyDrafts = z.infer<typeof privacyDraftsSchema>;
export const privacyCardSchema = z.discriminatedUnion('category', [
  z.object({ category: z.literal('profile'), data: profileSchema }).strict(),
  z.object({ category: z.literal('location'), data: locationSchema }).strict(),
  z.object({ category: z.literal('crafting'), data: craftingSchema }).strict(),
  z.object({ category: z.literal('supply'), data: supplySchema }).strict(),
]);
export type PrivacyCard = z.infer<typeof privacyCardSchema>;
export function readyToPublish(card: PrivacyCard): boolean {
  switch (card.category) {
    case 'profile':
      return card.data.displayName.length > 0;
    case 'location':
      return card.data.directions.length > 0;
    case 'crafting':
      return card.data.specialties.length > 0;
    case 'supply':
      return card.data.offers.length > 0;
  }
}
const times = { publishedAt: z.iso.datetime(), expiresAt: z.iso.datetime() };
function publication<T extends z.ZodType>(schema: T, hours: number) {
  return z
    .object({ data: schema, ...times })
    .strict()
    .refine(
      (p) =>
        Date.parse(p.expiresAt) > Date.parse(p.publishedAt) &&
        Date.parse(p.expiresAt) - Date.parse(p.publishedAt) <= hours * 3600000,
    );
}
export const privacyRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.uuid().nullable(),
    shareId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    drafts: privacyDraftsSchema,
    publications: z
      .object({
        profile: publication(
          profileSchema.refine((v) => v.displayName.length > 0),
          168,
        ).nullable(),
        location: publication(
          locationSchema.refine((v) => v.directions.length > 0),
          24,
        ).nullable(),
        crafting: publication(
          craftingSchema.refine((v) => v.specialties.length > 0),
          168,
        ).nullable(),
        supply: publication(
          supplySchema.refine((v) => v.offers.length > 0),
          168,
        ).nullable(),
      })
      .strict(),
  })
  .strict();
export type PrivacyRecord = z.infer<typeof privacyRecordSchema>;
const publicCardSchema = z.discriminatedUnion('category', [
  z.object({ category: z.literal('profile'), data: profileSchema, ...times }).strict(),
  z.object({ category: z.literal('location'), data: locationSchema, ...times }).strict(),
  z.object({ category: z.literal('crafting'), data: craftingSchema, ...times }).strict(),
  z.object({ category: z.literal('supply'), data: supplySchema, ...times }).strict(),
]);
export const publicShareSchema = z.object({ cards: z.array(publicCardSchema).min(1).max(4) }).strict();
export type PublicShare = z.infer<typeof publicShareSchema>;
export const privacyEnvelopeSchema = z.object({ record: privacyRecordSchema, checkedAt: z.iso.datetime() }).strict();
const revision = z.uuid().nullable();
export const privacyInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save-draft'), revision, card: privacyCardSchema }).strict(),
  z
    .object({
      action: z.literal('publish'),
      revision,
      card: privacyCardSchema.refine(readyToPublish),
      hours: z.union([z.literal(1), z.literal(24), z.literal(168)]),
      confirmed: z.literal(true),
    })
    .strict()
    .refine((v) => v.card.category !== 'location' || v.hours <= 24),
  z.object({ action: z.literal('unpublish'), revision, category: z.enum(privacyCategories) }).strict(),
  z.object({ action: z.literal('revoke-all'), revision }).strict(),
  z.object({ action: z.literal('rotate-link'), revision }).strict(),
]);
export type PrivacyInput = z.infer<typeof privacyInputSchema>;
export function emptyPrivacy(): PrivacyRecord {
  return {
    schemaVersion: 1,
    revision: null,
    shareId: null,
    drafts: {
      profile: { displayName: '', about: '' },
      location: { map: 'Hagga Basin', directions: '', note: '' },
      crafting: { specialties: [], details: '', contact: '' },
      supply: { offers: [], details: '', contact: '' },
    },
    publications: { profile: null, location: null, crafting: null, supply: null },
  };
}
export function privacyCard(category: PrivacyCategory, drafts: PrivacyDrafts): PrivacyCard {
  switch (category) {
    case 'profile':
      return { category, data: drafts.profile };
    case 'location':
      return { category, data: drafts.location };
    case 'crafting':
      return {
        category,
        data: { ...drafts.crafting, specialties: drafts.crafting.specialties.map((s) => s.trim()).filter(Boolean) },
      };
    case 'supply':
      return { category, data: drafts.supply };
  }
}
/** Explicit projection: never spread drafts, routing identifiers or account metadata into a member response. */
export function publicPrivacyView(record: PrivacyRecord, now: number): PublicShare | null {
  const cards: PublicShare['cards'] = [];
  for (const category of privacyCategories) {
    const published = record.publications[category];
    if (published && Date.parse(published.expiresAt) > now)
      cards.push(publicCardSchema.parse({ category, ...published }));
  }
  return cards.length ? publicShareSchema.parse({ cards }) : null;
}
