# Dashboard: portal, status and market

## Purpose

The signed-in landing area and the community-wide views of the world.

## Pages

| Page      | Route        | Shows                                                                                                                 |
| --------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Landing   | `/`          | Public product introduction, feature overview and the way in ([below](#landing-page))                                 |
| Portal    | `/portal`    | World briefing (map markers, exchange stats, Landsraad), population and population history chart, your guild          |
| Market    | `/market`    | CHOAM exchange items, aggregated by item, with prices (full precision), listings and "my listings" for your character |
| Changelog | `/changelog` | Public release notes parsed from `CHANGELOG.md`                                                                       |

## Requirements and permissions

Public pages keep the topbar minimal when signed out: branding and Sign in, including mobile. Signed-in visitors retain the workspace navigation, which now starts with Home, and see Open dashboard actions on the landing page instead of Discord sign-in prompts. The login page redirects an existing valid session to the dashboard.

Sign-in plus the member role. Data comes from the Console with `CONSOLE_API_KEY` (Read on players, exchange, maps, landsraad;
see [Dune Console](../configuration/dune-console.md#suggested-key-scopes)). **My listings only ever shows orders that belong to
the linked character**, and seller player IDs from the Console never reach the browser.

## How it works

The portal reads through a snapshot/data provider that caches Console responses in Redis (`arrakis:dashboard:snapshot`,
`arrakis:read:v1:*`) so many members do not multiply Console load. Population is sampled in the background and stored for the
history chart. Reads are budgeted (120/min per client, `API_GLOBAL_READ_LIMIT` globally; [rate limiting](../configuration/rate-limiting.md)).

## Landing page

`/` is public and server-rendered. It is built from `src/features/landing/`:

| File                           | Role                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `content.ts`                   | Every word and link on the page: hero, overview, featured capabilities, capability grid, operator notes |
| `components/landing-page.tsx`  | The page: hero, overview, features, more capabilities, operators, final call to action                  |
| `components/illustrations.tsx` | Three labelled layout illustrations (dashboard, map, guild roster)                                      |
| `src/app/page.tsx`             | Route entry plus page metadata (title, description, Open Graph and Twitter preview)                     |

**Call to action.** Signed-out visitors get "Sign in with Discord" (`/login`, the existing sign-in flow); signed-in members get "Open dashboard" (`/portal`). The only thing the page learns about a visitor is whether a session exists. A failing session lookup counts as signed out, so a storage problem cannot take the public page down.

**Keeping the content true.** Edit `content.ts`, not the markup. Say only what the running product does, check each claim against `docs/features/` and the code behind its route, and leave out anything unfinished (Community Events and Service Status are not on the page until released). No statistics, counts or testimonials: the illustrations show layout, never data. Feature links go to signed-in routes on purpose, so a signed-out visitor is sent to sign in first; labels describe the feature and never promise to open it directly. `tests/unit/landing/landing-page.test.ts` checks every link against the routes in `src/app/`, rejects known obsolete phrases and invented figures, and confirms nothing about the signed-in member reaches the page.

**The casino is described as it is:** real in-game Solaris, closed by default until a server administrator switches it on. There is no demonstration mode.

**Illustrations, not screenshots.** The fixture world that the browser tests run against is mostly empty (no spice conditions, no markers), so screenshots of it would misrepresent the product. The illustrations are drawn from the dashboard's own design primitives, are hidden from assistive technology, and carry the caption "Illustration of the layout. It shows no real data." If real screenshots are added later, capture them from a populated test server with a sanitised account, serve them through the asset route (add the directory to its allowlist in `src/pages/api/assets/[...path].ts`, with a strict filename pattern and a test), and give them real alt text.

**Accessibility.** One `h1`; every section is a landmark named by its heading; decorative illustrations are `aria-hidden` and captioned; links keep their accessible names (a stretched-link pattern makes whole capability cards clickable while the link name stays the title); animation is a single gentle entrance that the global reduced-motion rule switches off; body text is sand on obsidian well above AA contrast. `tests/browser/landing.spec.ts` runs axe (WCAG 2 A and AA) on the page signed in and out at desktop and phone widths, walks the keyboard order, and checks that every width from 320px to ultrawide scrolls only vertically.

**Screenshots.** `tests/browser/landing.spec.ts` writes screenshots (desktop, mobile, 320px, hero, features, topbar with Home, Home after navigating from a nested route) to `test-results/landing/` on every run. That folder is ignored by Git and cleared at the start of each Playwright run, so look at them straight after running `npx playwright test tests/browser/landing.spec.ts`.

### Home in the topbar

Home is the first entry of the shared navigation inventory (`src/components/navigation/nav-config.ts`, `href: '/'`, `exact: true`), so the desktop bar, the active-state logic and the tests all use one source. It is shown to signed-in members only: the signed-out topbar stays branding plus Sign in, as before.

- **Desktop (from 1280px):** an icon and "Home" first in the primary navigation. It is the current page (`aria-current="page"`) only on `/`, never on dashboard routes.
- **Below 1280px:** the primary navigation is hidden, so a compact Home control sits beside notifications and the menu: icon only on phones, icon and label from 768px, always a 44px touch target with a visible focus ring. The mobile menu does not repeat it.
- **Under 360px** the header shows only the logo mark so the three controls keep full-size targets; the link still has the accessible name "Arrakis Control home". Between 360px and 400px the wordmark is tighter.
- Navigation uses the normal client-side link (a full document load only where a route has its own document policy, today `/status`). It works identically from every dashboard section; `tests/browser/landing.spec.ts` clicks it from the portal, character, holdings, vehicles, market, guilds, map, Live Chat, the casino and the base pages.

### Colour variables

Plain CSS (`globals.css`, the map and casino stylesheets) reads the palette as `var(--color-spice-400)` and so on. Tailwind v4 does not turn JS-config colours into CSS variables on its own, so `src/styles/tokens.css` defines them, mirroring `tailwind.config.ts`. Without them the declarations are invalid and silently lost: no focus ring, unstyled primary buttons, uncoloured eyebrows. `tests/unit/styles/tokens.test.ts` fails if the tokens drift from the config or if any stylesheet reads a variable that is not defined.

## Status API

`GET /api/server/status` returns real counts to anonymous visitors and nothing else ([API](../api/server.md#server-status)).

## Limitations

Values are only as fresh as the Console reports and the cache allows. Features the Console does not support (an unreachable
exchange, no realtime agent) are reported as unavailable instead of failing the page.

## Troubleshooting

Empty portal or market: [Console connection](../troubleshooting/console-connection.md). Slow pages: [performance](../troubleshooting/common-issues.md#performance).

## Related

[Maps](maps.md) · [Player pages](player-management.md) · [API](../api/server.md)

## Service status

Signed-in members can open **More → Service status** (`/status`) to view the configured PacketNodes Hosting report from HetrixTools. The link always stays inside More, including wide desktop navigation and the mobile drawer. This external hosting report is separate from the dashboard’s game population and Console status readings.

The report uses a sandboxed, no-referrer iframe pointing to `https://wl.hetrixtools.com/r/6fb3cbf6a8f67831f3e046b945b82450/`. Its parent resizer is bundled locally at version 4.3.11, matching the supplied embed, rather than executing a remote CDN script in the dashboard. Resizing accepts the report’s exact origin, cleans up on navigation and bounds frame height. If resizing is unavailable, scrolling and an external report link remain available. The provider controls availability and content inside the iframe and may receive the viewer’s IP and browser information.

Only `/status` permits the HetrixTools frame origin in its document CSP. Navigation into and out of that route uses a full document load, since client-side transitions cannot replace the active document policy. Other pages retain their existing frame policy, and no additional script, image or connection origin is allowed in the parent dashboard. No credentials are passed to the report, and no new environment settings are needed.
