import { expect, it } from 'vitest';
import { logText, serviceNames } from '../../../src/modules/admin/screens/LogsScreen';

it('reads service names and log text from varied provider shapes', () => {
  expect(serviceNames(['a', 'b', 'a'])).toEqual(['a', 'b']);
  expect(serviceNames({ services: [{ name: 'game' }, { service: 'db' }, 7] })).toEqual(['game', 'db']);
  expect(serviceNames(null)).toEqual([]);
  expect(logText({ logs: ['one', 'two'] })).toBe('one\ntwo');
  expect(logText('plain')).toBe('plain');
  expect(logText({ unexpected: true })).toBe('');
});
