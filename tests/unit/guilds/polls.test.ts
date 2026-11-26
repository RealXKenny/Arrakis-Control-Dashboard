import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pollDraftSchema, pollInputSchema, storedPollSchema } from '../../../src/features/guilds/polls';
import { guildPollView } from '../../../src/features/guilds/server/polls-store';

const draft = () => ({
  id: randomUUID(),
  question: 'When should we run?',
  details: '',
  closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  options: [
    { id: randomUUID(), text: 'Saturday' },
    { id: randomUUID(), text: 'Sunday' },
  ],
});
describe('guild poll contracts', () => {
  it('requires distinct bounded choices and refuses voter identity or published-question edits', () => {
    const poll = draft();
    expect(pollDraftSchema.safeParse(poll).success).toBe(true);
    for (const options of [
      [poll.options[0]],
      [poll.options[0], poll.options[0]],
      [poll.options[0], { id: randomUUID(), text: ' saturday ' }],
      Array.from({ length: 11 }, (_, index) => ({ id: randomUUID(), text: String(index) })),
    ])
      expect(pollDraftSchema.safeParse({ ...poll, options }).success).toBe(false);
    expect(
      pollInputSchema.safeParse({
        action: 'vote',
        id: poll.id,
        revision: randomUUID(),
        optionId: poll.options[0].id,
        memberId: 'someone-else',
      }).success,
    ).toBe(false);
    expect(pollInputSchema.safeParse({ action: 'edit', poll }).success).toBe(false);
  });
  it('rejects duplicate stored voters and choices that do not belong to the poll', () => {
    const poll = {
      ...draft(),
      revision: randomUUID(),
      status: 'open',
      createdAt: new Date().toISOString(),
      organizerName: 'Leader',
      votes: [],
    };
    const vote = { memberId: 'pawn', optionId: poll.options[0].id };
    expect(storedPollSchema.safeParse({ ...poll, votes: [vote, vote] }).success).toBe(false);
    expect(storedPollSchema.safeParse({ ...poll, votes: [{ ...vote, optionId: randomUUID() }] }).success).toBe(false);
  });
  it('returns aggregate totals and only the caller choice, with authoritative closed state', () => {
    const poll = storedPollSchema.parse({
      ...draft(),
      revision: randomUUID(),
      status: 'open',
      createdAt: new Date().toISOString(),
      organizerName: 'Leader',
      votes: [],
    });
    poll.votes = [
      { memberId: 'private-pawn', optionId: poll.options[0].id },
      { memberId: 'another-pawn', optionId: poll.options[1].id },
    ];
    const view = guildPollView(poll, 'private-pawn');
    expect(view.ownOptionId).toBe(poll.options[0].id);
    expect(view.totalVotes).toBe(2);
    expect(view.results.map((value) => value.count)).toEqual([1, 1]);
    expect(JSON.stringify(view)).not.toMatch(/private-pawn|another-pawn|memberId|"votes"/);
    expect(guildPollView(poll, 'other', Date.parse(poll.closesAt)).closed).toBe(true);
    expect(guildPollView({ ...poll, status: 'closed' }, 'other', 0).closed).toBe(true);
  });
});
