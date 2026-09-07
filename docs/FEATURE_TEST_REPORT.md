# Portal feature verification — 2026-09-07

Tested the production build locally at http://127.0.0.1:2008 using the signed-in browser and real Dune/Redis integration. The site remains running locally. No production deployment or game import was performed.

## Live browser checks

| Area | Result |
| --- | --- |
| Discord login | Successful callback; server established a 43,200-second session. |
| Session persistence | Login survived navigation, reload, more than six minutes of testing, and a local server restart. A full 12-hour elapsed-time test was not performed. |
| Character | Real character, Discord avatar, level, faction standing, journey and equipment rendered. |
| Storage | Backpack filtering, search and grid/list switching returned the expected matching stacks. |
| Bases | Three owned and one shared base rendered; shared base had no export control. Owned blueprint export returned HTTP 200. |
| Vehicles | Owned and shared filters displayed the corresponding vehicle and condition/fuel data. |
| Guild | Membership rendered; absent rank remained explicitly Not reported. |
| Market | Search, bot filter, price sorting and item seller ladder returned real data. My listings showed an empty table while global totals and buyback rate remained available. |
| Hagga Basin | Default checkboxes, possible/live spice badges, player popup, zoom, fit and manual refresh worked. |
| Deep Desert | Embedded map and live markers rendered within /portal. |
| Population history | Enabled for this local process; existing Redis observations rendered with gaps and the slider selected historical readings. |
| Landsraad | Both crest images and reported term/counts rendered. |
| Navigation | Portal tabs kept /portal; automated checks also cover back/forward/reload. |

## Automated checks

- 102 Vitest tests passed.
- 22 Chromium browser tests passed, including desktop/mobile/ultrawide layouts, cache restore, 30-second revalidation, account isolation, expired login and Retry-After handling.
- Production smoke passed across 13 API modules, including safe method/auth failures, caching, owned-resource protection, POST logout and revocation. No server-only import or MaxListenersExceededWarning regression.
- Typecheck and zero-warning lint passed.
- Added browser coverage for invalid/oversized blueprint uploads, safe failed import messaging, successful import UI and reuse of the operation ID on retry, plus guild membership.

## Limits and observations

- Import delivery is exercised with mocked transport and focused server tests; no blueprint was sent into the real game during this session.
- The 24-hour chart currently contains about two observed hours, rather than a fabricated continuous day. Leave the population recorder running to collect more history.
- Provider omissions remain visible: guild rank is not reported and one inventory item has no resolved name. These are not replaced with invented data.
- Market filter transitions briefly clear the previous result while awaiting the new reading; final global metrics and matching rows recover correctly.
- Browser tests are Chromium-based; no separate Firefox/Safari run was performed.
- API debug dumps were disabled for this test process. The actual .env file was not modified.
