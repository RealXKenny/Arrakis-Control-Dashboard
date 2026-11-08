import { expect, it } from 'vitest';
import catalog from '../../../src/features/admin/catalog.json' with { type: 'json' };
import {
  defaultQuery,
  fieldValue,
  operationFields,
  resultRows,
  resultHasNext,
  rowContext,
} from '../../../src/features/admin/operation-fields';
const operation = (id: string) => catalog.find((entry) => entry.id === id)!;
it('provides valid unique fields without repeating targets, files or adapter capability names', () => {
  for (const entry of catalog) {
    const fields = operationFields(entry);
    expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length);
    for (const field of fields) {
      expect(field.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(entry.pathParameters).not.toContain(field.name);
      expect(entry.files ?? []).not.toContain(field.name);
    }
  }
  expect(operationFields(operation('get-integrations-discord-players-me'))).toEqual([]);
});
it('builds typed player filters and bounded page defaults', () => {
  const entry = operation('get-players');
  expect(defaultQuery(entry)).toEqual({ page: 0, pageSize: 20 });
  expect(operationFields(entry)).toContainEqual(
    expect.objectContaining({ name: 'status', location: 'query', choices: ['all', 'online', 'offline', 'banned'] }),
  );
  expect(operationFields(entry)).toContainEqual(expect.objectContaining({ name: 'recentOnly', type: 'boolean' }));
});
it('keeps explicit query parameters out of mutation bodies and preserves nested descriptions', () => {
  expect(operationFields(operation('post-backups-system-import'))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'filename', location: 'query' }),
      expect.objectContaining({ name: 'onConflict', location: 'query' }),
    ]),
  );
  expect(operationFields(operation('put-bases-baseid-permissions'))).toEqual([
    expect.objectContaining({ name: 'entries', type: 'json' }),
  ]);
});
it('preserves large numbers, identifiers, booleans and structured values without lossy conversion', () => {
  const fields = operationFields(operation('post-guilds-guildid-members'));
  expect(
    fieldValue(
      fields.find((field) => field.name === 'playerId')!,
      '9007199254740993123',
    ),
  ).toBe('9007199254740993123');
  const amount = operationFields(operation('post-players-playerid-add-xp'))[0];
  expect(fieldValue(amount, '9007199254740993123')).toBe('9007199254740993123');
  expect(fieldValue(amount, '25')).toBe(25);
  expect(() => fieldValue(amount, 'NaN')).toThrow();
  const enabled = operationFields(operation('post-server-shutdown-protection'))[0];
  expect(fieldValue(enabled, 'false')).toBe(false);
  expect(fieldValue(enabled, '')).toBeUndefined();
});
it('extracts common list envelopes and pre-fills related guild member operations', () => {
  const rows = [{ player_id: '9007199254740993123', role_id: 1 }];
  expect(resultRows({ data: { members: rows } })).toEqual(rows);
  expect(rowContext(operation('get-guilds-guildid-members'), rows[0], { guildId: '2' })).toEqual({
    guildId: '2',
    playerId: '9007199254740993123',
  });
  expect(rowContext(operation('get-players-playerid-inventory'), { item_id: '7' }, { playerId: '3' })).toEqual({
    playerId: '3',
    itemId: '7',
  });
});

it('honors explicit pagination boundaries before falling back to row counts', () => {
  expect(resultHasNext({ rows: [{}], hasMore: false }, 0, 1)).toBe(false);
  expect(resultHasNext({ rows: [], hasMore: true }, 0, 20)).toBe(true);
  expect(resultHasNext({ rows: [{}], total: 21 }, 0, 20)).toBe(true);
  expect(resultHasNext({ rows: [{}], total: 21 }, 1, 20)).toBe(false);
});
