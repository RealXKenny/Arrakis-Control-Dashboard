# Supported platforms

"Verified" means exercised by the project's tests or local runs; "expected" means it follows from the runtime but was not exercised.

| Component            | Supported                                                                                   | Status                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js              | 22 or newer (egg image `nodejs_22`; CI Node 22)                                              | CI verified on 22; development runs were also done on a newer Node       |
| Package manager      | npm with `package-lock.json`                                                                 | Verified                                                                |
| Operating systems    | Linux (CI `ubuntu-latest`), Windows 10/11 for development and direct hosting                 | Linux via CI design (not yet run on GitHub); Windows verified locally   |
| Redis                | 7.x, standalone or Cluster                                                                   | 7.4.11 standalone and 3×(1+1) Cluster verified locally (a Windows build); Linux/official image via CI job (not yet run) |
| Hosting              | Node.js directly; Pterodactyl panel + Wings with the generated egg                            | Egg installer verified in an isolated simulation; not on a live panel   |
| Container image      | None provided                                                                                | —                                                                       |
| Browsers (users)     | Current Chromium-based browsers; WebGL2 for 3D (2D fallback otherwise)                         | Chromium via Playwright                                                 |
| Dune server stack    | RedBlink Dune Docker Console (HTTP API + Discord adapter)                                      | Compatibility depends on the Console version you run                     |
| Reverse proxy        | Any HTTPS proxy (Nginx example provided), Cloudflare                                           | Not automated                                                           |
| Database             | None (Redis only)                                                                             | —                                                                       |

Unsupported or untested: Redis 5/6 for production (scripts were also exercised on 5.0.14 once), Redis Sentinel, managed Redis services, Windows Server service
wrappers, ARM-specific issues, Internet Explorer/legacy browsers.
