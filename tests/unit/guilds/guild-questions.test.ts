import { describe, expect, it } from 'vitest';
import { guildApplicationQuestionSchema } from '../../../src/features/guilds/requirements';
import {
  APPLICATION_TIME_ZONES,
  formatGuildAnswer,
  guildAnswerError,
  guildQuestionVersion,
} from '../../../src/features/guilds/question-fields';
const base = { id: '915c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'Your answer', required: true };
describe('guild-owned application fields', () => {
  it('offers the full supported regional time-zone list plus UTC', () => {
    expect(APPLICATION_TIME_ZONES.length).toBeGreaterThan(400);
    expect(APPLICATION_TIME_ZONES).toEqual(
      expect.arrayContaining([
        'UTC',
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
        'Pacific/Auckland',
        'Africa/Johannesburg',
      ]),
    );
    expect(new Set(APPLICATION_TIME_ZONES).size).toBe(APPLICATION_TIME_ZONES.length);
  });
  it('validates each field type and preserves decimal strings without numeric conversion', () => {
    for (const [type, good, bad] of [
      ['shortText', 'Builder', 'x'.repeat(201)],
      ['longText', 'A longer response', true],
      ['timezone', 'Pacific/Auckland', 'Not/A_Zone'],
      ['dropdown', 'PvE', 'Other'],
      ['checkbox', true, false],
      ['number', '9007199254740993123', 'NaN'],
    ] as const) {
      const question = { ...base, type, ...(type === 'dropdown' ? { options: ['PvE', 'PvP'] } : {}) };
      expect(guildAnswerError([question], { [base.id]: good })).toBeNull();
      expect(guildAnswerError([question], { [base.id]: bad })).not.toBeNull();
      expect(guildAnswerError([question], {})).not.toBeNull();
      expect(guildAnswerError([{ ...question, required: false }], {})).toBeNull();
    }
    expect(formatGuildAnswer(false)).toBe('No');
    expect(formatGuildAnswer(true)).toBe('Yes');
  });
  it('requires valid unique dropdown choices and version-checks types and choices', () => {
    const dropdown = { ...base, type: 'dropdown' as const, options: ['PvE', 'PvP'] };
    expect(guildApplicationQuestionSchema.safeParse(dropdown).success).toBe(true);
    for (const options of [[], ['Only one'], ['Same', 'Same'], Array.from({ length: 31 }, (_, i) => String(i))])
      expect(guildApplicationQuestionSchema.safeParse({ ...dropdown, options }).success).toBe(false);
    expect(guildQuestionVersion([dropdown])).not.toBe(
      guildQuestionVersion([{ ...dropdown, options: ['PvE', 'Both'] }]),
    );
    expect(guildQuestionVersion([base])).not.toBe(guildQuestionVersion([{ ...base, type: 'timezone' }]));
  });
});
