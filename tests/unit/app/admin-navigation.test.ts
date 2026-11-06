import { expect, it } from 'vitest';
import catalog from '../../../src/modules/admin/catalog.json';
import { ADMIN_SECTIONS, adminHref, findAdminTab, tabForOperation } from '../../../src/modules/admin/navigation';

it('hosts every catalog operation on exactly one screen', () => {
  for (const operation of catalog) {
    const owners = ADMIN_SECTIONS.flatMap((section) => section.tabs).filter((tab) =>
      tab.groups.includes(operation.group),
    );
    expect(owners, operation.id).toHaveLength(1);
    expect(tabForOperation(operation)?.tab.id).toBe(owners[0].id);
  }
});

it('uses unique tab ids and falls back to the overview for unknown tabs', () => {
  const ids = ADMIN_SECTIONS.flatMap((section) => section.tabs.map((tab) => tab.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(findAdminTab('nope').tab.id).toBe('overview');
  expect(findAdminTab('market').section.id).toBe('world');
  expect(adminHref('market', 'get-exchange-stats')).toBe('/admin?tab=market&operation=get-exchange-stats');
});

it('keeps restricted operations out of working forms by labelling Console-only groups', () => {
  const consoleTab = findAdminTab('console').tab;
  const restricted = catalog.filter((entry) => entry.restriction && consoleTab.groups.includes(entry.group));
  expect(restricted.length).toBeGreaterThan(0);
});
