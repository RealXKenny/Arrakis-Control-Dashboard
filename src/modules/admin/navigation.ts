import type { AdminOperation } from './types';

/** Browser-safe map from the administration catalog to grouped sections and tabs. */

export type AdminTabKind =
  | 'overview'
  | 'guilds'
  | 'setup'
  | 'reference'
  | 'console'
  | 'operations'
  | 'players'
  | 'vehicles'
  | 'bases'
  | 'maps'
  | 'backups';
export const DEDICATED_KINDS: AdminTabKind[] = ['players', 'vehicles', 'bases', 'maps', 'backups'];
export type AdminTab = {
  id: string;
  label: string;
  kind: AdminTabKind;
  /** Catalog groups whose operations the tab hosts. */
  groups: string[];
  summary: string;
};
export type AdminSection = { id: string; label: string; tabs: AdminTab[] };

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'control',
    label: 'Control center',
    tabs: [
      {
        id: 'overview',
        label: 'Overview',
        kind: 'overview',
        groups: [],
        summary: 'Live health, population, trends and connection status.',
      },
      {
        id: 'tools',
        label: 'Admin tools',
        kind: 'operations',
        groups: ['Admin Tools'],
        summary: 'Cross-cutting administrator reads and actions.',
      },
    ],
  },
  {
    id: 'community',
    label: 'Players & community',
    tabs: [
      {
        id: 'players',
        label: 'Players',
        kind: 'players',
        groups: ['Players'],
        summary: 'Profiles, inventories, moderation and player actions.',
      },
      {
        id: 'guild-oversight',
        label: 'Guilds',
        kind: 'guilds',
        groups: [],
        summary: 'Guild directory, applications and private leader support chats.',
      },
      {
        id: 'guild-tools',
        label: 'Guild membership',
        kind: 'operations',
        groups: ['Guilds'],
        summary: 'Console guild rosters, ranks and disbanding.',
      },
      {
        id: 'care',
        label: 'Care packages',
        kind: 'operations',
        groups: ['Care Package System'],
        summary: 'Configuration, eligible players, grants and retries.',
      },
    ],
  },
  {
    id: 'assets',
    label: 'Game assets',
    tabs: [
      {
        id: 'vehicles',
        label: 'Vehicles',
        kind: 'vehicles',
        groups: ['Vehicles'],
        summary: 'Owned and stored vehicles, access and cargo.',
      },
      {
        id: 'bases',
        label: 'Bases & storage',
        kind: 'bases',
        groups: ['Bases & Storage'],
        summary: 'Bases, containers, refills, permissions and exports.',
      },
      {
        id: 'blueprints',
        label: 'Blueprints',
        kind: 'operations',
        groups: ['Blueprints'],
        summary: 'Blueprint lists, exports, imports and deletion.',
      },
    ],
  },
  {
    id: 'world',
    label: 'World & economy',
    tabs: [
      {
        id: 'maps',
        label: 'Maps & worlds',
        kind: 'maps',
        groups: ['Maps & World'],
        summary: 'Maps, partitions, configuration and terminals.',
      },
      {
        id: 'live-map',
        label: 'Live map',
        kind: 'operations',
        groups: ['Live Map'],
        summary: 'Partitions, markers, players and supported teleportation.',
      },
      {
        id: 'market',
        label: 'Market',
        kind: 'operations',
        groups: ['Market Board'],
        summary: 'Listings, orders, buyback and seed plans.',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    tabs: [
      {
        id: 'server',
        label: 'Server',
        kind: 'operations',
        groups: ['Server Operations'],
        summary: 'Start, stop, restart, schedules, health and diagnostics.',
      },
      {
        id: 'backups',
        label: 'Backups',
        kind: 'backups',
        groups: ['Backups'],
        summary: 'Game and system backups with restore previews.',
      },
      {
        id: 'logs',
        label: 'Logs',
        kind: 'operations',
        groups: ['Logs & Monitoring'],
        summary: 'Bounded log reads and live streams.',
      },
      {
        id: 'updates',
        label: 'Updates',
        kind: 'operations',
        groups: ['Updates'],
        summary: 'Update checks; restricted writes hand off to Console.',
      },
      {
        id: 'addons',
        label: 'Addons',
        kind: 'operations',
        groups: ['Addons'],
        summary: 'Catalog and installed addons; restricted writes hand off to Console.',
      },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration & advanced',
    tabs: [
      {
        id: 'setup',
        label: 'Setup & connections',
        kind: 'setup',
        groups: [],
        summary: 'Credential and connection checks, with secrets never shown.',
      },
      {
        id: 'discord',
        label: 'Discord integrations',
        kind: 'operations',
        groups: ['Discord Adapter (Experimental)'],
        summary: 'Adapter health, catalog, links and lookups.',
      },
      {
        id: 'directory',
        label: 'Public directory',
        kind: 'operations',
        groups: ['Settings & Public Directory'],
        summary: 'Directory status; editing and claiming hand off to Console.',
      },
      {
        id: 'reference',
        label: 'API reference',
        kind: 'reference',
        groups: [],
        summary: 'Every operation, parameter, credential and restriction.',
      },
      {
        id: 'console',
        label: 'Console-only',
        kind: 'console',
        groups: ['Database', 'IAM Policies', 'API Keys', 'Authentication & Setup'],
        summary: 'Destinations that must be administered in the Console itself.',
      },
    ],
  },
];

export const ALL_ADMIN_TABS = ADMIN_SECTIONS.flatMap((section) => section.tabs.map((tab) => ({ section, tab })));
export const DEFAULT_ADMIN_LOCATION = { section: ADMIN_SECTIONS[0], tab: ADMIN_SECTIONS[0].tabs[0] };

export function findAdminTab(tabId: unknown) {
  return ALL_ADMIN_TABS.find((entry) => entry.tab.id === tabId) ?? DEFAULT_ADMIN_LOCATION;
}

/** The screen that owns an operation; `undefined` only for a group no tab hosts (a coverage failure). */
export function tabForOperation(operation: Pick<AdminOperation, 'group'>) {
  return ALL_ADMIN_TABS.find((entry) => entry.tab.groups.includes(operation.group));
}

export function adminHref(tab: string, operation?: string) {
  const params = new URLSearchParams({ tab });
  if (operation) {
    params.set('operation', operation);
    params.set('advanced', '1');
  }
  return `/admin?${params.toString()}`;
}
