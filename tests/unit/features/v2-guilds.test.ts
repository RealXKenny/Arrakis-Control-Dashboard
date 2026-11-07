import { describe, expect, it } from 'vitest';
import {
  batchGuildIds,
  factionEmblem,
  findGuildDetails,
  guildInitials,
  reportedGuild,
  unreadLabel,
} from '../../../src/features/guilds/details';
import { logoProblem } from '../../../src/features/guilds/logo';
import {
  groupMembersByRank,
  memberActions,
  memberRows,
  toMemberView,
  type GuildMemberView,
} from '../../../src/features/guilds/members';
import {
  addQuestion,
  changeQuestionType,
  cleanQuestions,
  MAX_QUESTIONS,
  patchQuestion,
  removeQuestion,
} from '../../../src/features/guilds/questions';
import { guildRequirementSchema } from '../../../src/modules/guilds/requirements';

const member = (name: string, roleId: number | null, id: string | null = name): GuildMemberView => ({
  id,
  name,
  roleId,
});

describe('guild roster', () => {
  it('normalises provider rows and rejects unsafe IDs and roles', () => {
    expect(toMemberView({ player_id: 'p-1', character_name: ' Stilgar ', role_id: '50' })).toEqual({
      id: 'p-1',
      name: 'Stilgar',
      roleId: 50,
    });
    expect(toMemberView({ player_id: 'bad id!', role_id: 500 })).toEqual({
      id: null,
      name: 'Unknown member',
      roleId: null,
    });
  });

  it('reads rows from the shapes the Console returns', () => {
    const row = { player_id: '1' };
    expect(memberRows([row, 4, null])).toEqual([row]);
    expect(memberRows({ rows: [row] })).toEqual([row]);
    expect(memberRows({ data: [row] })).toEqual([row]);
    expect(memberRows('nope')).toEqual([]);
  });

  it('groups by rank in order, sorts by name, and only shows other ranks when used', () => {
    const groups = groupMembersByRank([member('zed', 1), member('Alia', 1), member('Duncan', 50), member('Paul', 100)]);
    expect(groups.map((group) => group.label)).toEqual(['Leader', 'Officer', 'Member']);
    expect(groups[2].members.map((entry) => entry.name)).toEqual(['Alia', 'zed']);

    const withOther = groupMembersByRank([member('Odd', 75), member('Unranked', null)]);
    expect(withOther.at(-1)).toMatchObject({ key: 'other' });
    expect(withOther.at(-1)?.members).toHaveLength(2);
  });

  it('offers management actions by rank and never for the leader or unverifiable rows', () => {
    expect(memberActions(member('a', 1))).toEqual(['promote', 'remove']);
    expect(memberActions(member('a', 50))).toEqual(['demote', 'transfer', 'remove']);
    expect(memberActions(member('a', 100))).toEqual([]);
    expect(memberActions(member('a', null))).toEqual([]);
    expect(memberActions(member('a', 1, null))).toEqual([]);
  });
});

describe('guild details', () => {
  const rows = [
    { guild_id: 7, guild_name: 'Fremen', guild_faction_name: 'Atreides', member_count: 12, guild_description: 'Water' },
    { guild_id: 8, guild_name: 'Smugglers' },
  ];

  it('finds a guild by ID or by name and defaults missing fields', () => {
    expect(findGuildDetails(rows, { id: '7' })).toMatchObject({ id: '7', name: 'Fremen', memberCount: 12 });
    expect(findGuildDetails(rows, { name: 'Smugglers' })).toMatchObject({
      id: '8',
      faction: 'Not reported',
      memberCount: null,
    });
    expect(findGuildDetails(rows, { id: '99' })).toBeNull();
    expect(findGuildDetails(rows, {})).toBeNull();
  });

  it('only trusts a reported guild ID that is safe in a URL path', () => {
    expect(reportedGuild({ guild: { id: 7, name: 'Fremen' } })).toEqual({ id: '7', name: 'Fremen' });
    expect(reportedGuild({ guild: { id: '../admin' } })).toBeNull();
    expect(reportedGuild({ guild: null })).toBeNull();
    expect(reportedGuild(undefined)).toBeNull();
  });

  it('builds monograms, faction emblems and unread labels', () => {
    expect(guildInitials('house atreides guild')).toBe('HA');
    expect(guildInitials('   ')).toBe('◈');
    expect(factionEmblem('House Harkonnen')).toBe('/maps/harkonnen.webp');
    expect(factionEmblem('Fremen')).toBeNull();
    expect(unreadLabel(7)).toBe('7');
    expect(unreadLabel(250)).toBe('99+');
  });

  it('batches status polls within the API limits of 20 IDs and 1,500 characters', () => {
    expect(batchGuildIds([])).toEqual([]);
    const twentyOne = Array.from({ length: 21 }, (_, index) => `g${index}`);
    expect(batchGuildIds(twentyOne).map((batch) => batch.length)).toEqual([20, 1]);
    const long = Array.from({ length: 15 }, (_, index) => `${index}`.padEnd(128, 'x'));
    const batches = batchGuildIds(long);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((batch) => batch.join(',').length <= 1500)).toBe(true);
  });
});

describe('guild logo pre-check', () => {
  it('accepts a PNG within 512 KiB only', () => {
    expect(logoProblem({ type: 'image/png', size: 512 * 1024 })).toBeNull();
    expect(logoProblem({ type: 'image/png', size: 512 * 1024 + 1 })).not.toBeNull();
    expect(logoProblem({ type: 'image/jpeg', size: 10 })).not.toBeNull();
    expect(logoProblem({ type: 'image/png', size: 0 })).not.toBeNull();
  });
});

describe('guild question editing', () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

  it('adds up to the limit and removes or patches by ID', () => {
    let questions = addQuestion([], id(1));
    expect(questions).toEqual([{ id: id(1), label: '', required: true, type: 'shortText' }]);
    for (let n = 2; n < 20; n++) questions = addQuestion(questions, `q${n}`);
    expect(questions).toHaveLength(MAX_QUESTIONS);
    expect(removeQuestion(questions, 'q2')).toHaveLength(MAX_QUESTIONS - 1);
    expect(patchQuestion(questions, 'q2', { label: 'Why?' }).find((q) => q.id === 'q2')?.label).toBe('Why?');
  });

  it('gives dropdowns two blank choices and clears them again for other types', () => {
    const base = addQuestion([], id(1));
    const dropdown = changeQuestionType(base, id(1), 'dropdown');
    expect(dropdown[0].options).toEqual(['', '']);
    expect(changeQuestionType(dropdown, id(1), 'checkbox')[0].options).toBeUndefined();
  });

  it('cleans choices so a saved listing passes the shared schema', () => {
    const questions = changeQuestionType(
      patchQuestion(addQuestion([], id(1)), id(1), { label: 'Role' }),
      id(1),
      'dropdown',
    );
    const draft = patchQuestion(questions, id(1), { options: [' Builder ', '', 'Raider\n'] });
    const base = { guildName: 'Fremen', requirements: 'Be kind', contact: '', published: true };
    expect(guildRequirementSchema.safeParse({ ...base, applicationQuestions: draft }).success).toBe(false);
    const cleaned = cleanQuestions(draft);
    expect(cleaned[0].options).toEqual(['Builder', 'Raider']);
    expect(guildRequirementSchema.safeParse({ ...base, applicationQuestions: cleaned }).success).toBe(true);
  });
});
