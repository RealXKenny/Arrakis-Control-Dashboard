import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { onboardingGuideSchema, onboardingInputSchema, emptyOnboarding } from '../../../src/features/guilds/onboarding';
import { onboardingActor, onboardingKey } from '../../../src/features/guilds/server/onboarding-access';
import { onboardingView } from '../../../src/features/guilds/server/onboarding-store';

describe('recruit onboarding contracts', () => {
  it('bounds guide fields, checklist count and duplicate IDs, rejecting caller identities', () => {
    const step = { id: randomUUID(), text: 'Meet your mentor' };
    const guide = { welcome: '', rules: '', locations: '', steps: [step] };
    expect(onboardingGuideSchema.safeParse(guide).success).toBe(true);
    for (const changed of [
      { ...guide, steps: [step, step] },
      { ...guide, rules: 'x'.repeat(4001) },
      { ...guide, steps: Array.from({ length: 21 }, () => ({ ...step, id: randomUUID() })) },
    ])
      expect(onboardingGuideSchema.safeParse(changed).success).toBe(false);
    expect(
      onboardingInputSchema.safeParse({
        action: 'complete',
        revision: null,
        stepId: step.id,
        completed: true,
        memberKey: 'a'.repeat(64),
      }).success,
    ).toBe(false);
  });
  it('uses canonical roster identity with bounded current members and guild-isolated references', () => {
    const actor = onboardingActor('2', {
      memberId: 'pawn',
      canEdit: false,
      roster: [
        { player_id: 'pawn', character_name: 'Recruit', role_id: 1 },
        { player_id: 'bad', role_id: 0 },
      ],
    });
    expect(actor.roster).toHaveLength(1);
    expect(actor.memberKey).not.toBe(onboardingKey('3', 'pawn'));
    expect(() =>
      onboardingActor('2', { memberId: 'outsider', canEdit: true, roster: [{ player_id: 'pawn', role_id: 1 }] }),
    ).toThrow();
  });
  it('shows members only their own progress and flags departed mentors without leaking another recruit', () => {
    const self = onboardingKey('2', 'pawn');
    const other = onboardingKey('2', 'other');
    const book = emptyOnboarding('2');
    book.members = [self, other].map((memberKey) => ({
      memberKey,
      memberName: memberKey === self ? 'Recruit' : 'Private recruit',
      mentorKey: other,
      completed: [],
      rulesRevision: null,
      updatedAt: new Date().toISOString(),
    }));
    const actor = { memberKey: self, canEdit: false, roster: [{ key: self, name: 'Fresh recruit name' }] };
    const view = onboardingView(book, actor);
    expect(view.self?.memberName).toBe('Fresh recruit name');
    expect(view.self?.mentorName).toBeNull();
    expect(view.members).toEqual([]);
    expect(view.roster).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('Private recruit');
    expect(onboardingView(book, { ...actor, canEdit: true }).members[1].currentMember).toBe(false);
  });
});
