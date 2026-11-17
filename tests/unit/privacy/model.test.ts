import { expect, it } from 'vitest';
import {
  emptyPrivacy,
  privacyInputSchema,
  privacyRecordSchema,
  publicPrivacyView,
  privacyCard,
} from '../../../src/features/privacy/model';
it('starts every category private without copying account/game data', () => {
  expect(publicPrivacyView(emptyPrivacy(), Date.now())).toBeNull();
  expect(emptyPrivacy().shareId).toBeNull();
  expect(emptyPrivacy().publications).toEqual({ profile: null, location: null, crafting: null, supply: null });
});
it('requires explicit consent, bounded expiry and well-formed exact payloads', () => {
  const valid = {
    action: 'publish',
    revision: null,
    card: { category: 'profile', data: { displayName: 'Explorer', about: '' } },
    hours: 24,
    confirmed: true,
  };
  expect(privacyInputSchema.safeParse(valid).success).toBe(true);
  for (const raw of [
    { ...valid, confirmed: false },
    { ...valid, owner: 'foreign' },
    { ...valid, expiresAt: '2099' },
    { ...valid, card: { category: 'profile', data: { displayName: 'X', about: '', email: 'private' } } },
    { ...valid, card: { category: 'profile', data: { displayName: '\ud800', about: '' } } },
    {
      ...valid,
      card: { category: 'location', data: { map: 'Hagga Basin', directions: 'Only this point', note: '' } },
      hours: 168,
    },
  ])
    expect(privacyInputSchema.safeParse(raw).success).toBe(false);
});
it('projects only published unexpired fields and never private drafts or routing metadata', () => {
  const record = emptyPrivacy();
  const now = Date.parse('2026-11-15T12:00:00Z');
  record.drafts.profile = { displayName: 'Secret draft', about: 'Never publish' };
  record.publications.profile = {
    data: { displayName: 'Shared name', about: 'Chosen introduction' },
    publishedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
  };
  const view = publicPrivacyView(record, now);
  expect(view?.cards).toHaveLength(1);
  const text = JSON.stringify(view);
  expect(text).toContain('Shared name');
  for (const secret of ['Secret draft', 'Never publish', 'shareId', 'revision', 'drafts'])
    expect(text).not.toContain(secret);
  expect(publicPrivacyView(record, now + 3600000)).toBeNull();
});
it('preserves exact supply quantities, rejects duplicate offers and normalizes crafting editor blank lines before review', () => {
  const card = {
    category: 'supply',
    data: { offers: [{ item: 'Spice', quantity: '9007199254740993', unit: 'units' }], details: '', contact: '' },
  };
  expect(
    privacyInputSchema.safeParse({ action: 'publish', revision: null, card, hours: 24, confirmed: true }).success,
  ).toBe(true);
  expect(
    privacyInputSchema.safeParse({
      action: 'save-draft',
      revision: null,
      card: { ...card, data: { ...card.data, offers: [...card.data.offers, ...card.data.offers] } },
    }).success,
  ).toBe(false);
  const drafts = emptyPrivacy().drafts;
  drafts.crafting.specialties = [' Metal ', ''];
  expect(privacyCard('crafting', drafts)).toMatchObject({ data: { specialties: ['Metal'] } });
  expect(privacyRecordSchema.safeParse({ ...emptyPrivacy(), owner: 'other' }).success).toBe(false);
});
