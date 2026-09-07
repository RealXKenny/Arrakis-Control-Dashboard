<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Engineering acceptance criteria

- Preserve Pages Router and feature isolation in `src/modules`. Keep reusable presentation in `src/components`, transport in `src/infrastructure`, and system services in `src/lib`.
- Validate configuration in `src/config/env.ts`. Never import server credentials or provider clients into browser modules, even transitively.
- Wrap every API route with `runPagesApiHandler`. Authentication is not authorization: scope privileged operations to the signed-in user's server-verified resources.
- Keep state-changing actions out of GET navigation. Logout is POST-only. Never prefetch OAuth or logout endpoints.
- Own request lifetimes: bound network waits, cancel on unmount, prevent overlapping polls, pause background polling, distinguish missing data from zero, and label stale readings.
- Do not ship buttons for nonexistent endpoints or make up live server data. Document unsupported capabilities and release limitations.
- New behavior needs explicit types and focused tests for success and failure. Preserve API compatibility unless correcting a documented security issue.
- Run typecheck, zero-warning lint, unit tests, production build, production smoke, and browser tests before release. Visually inspect desktop and mobile screenshots for UI changes.
- See `docs/PORTAL_REBUILD.md` for the design direction, completed work, and remaining release checks. Do not describe a build as universally production-safe solely because its tests pass.
