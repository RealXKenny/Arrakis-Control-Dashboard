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


## vexp - Context-Aware AI Coding <!-- vexp v3.1.2 -->

### Context strategy: call run_pipeline ONCE at task start
If the task already names the files/symbols to touch, SKIP vexp. Otherwise one
`run_pipeline({ "task": "..." })` returns ranked pivot files with line ranges and
blast radius. Do NOT open files one by one to find your way around - every extra
tool call costs a turn. Call it again ONLY when the task moves to a new area.
`get_skeleton` for files to understand, not edit. `verify_done` before calling a
multi-file task complete, then RUN the tests it names.

### Query shape (do this)
Anchor the task on real identifiers (ClassName, functionName) or file paths:
`run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`

vexp runs entirely on this machine, index in `.vexp/`;
`run_pipeline` transmits nothing to any external service.
On `status: "degraded"` or 0 pivots the index is still building - use your own tools.
For literal string sweeps use your native search - do NOT route text sweeps through vexp.
Repo SOURCE only: logs, dist/, node_modules/ and files outside the repo are NOT indexed.
<!-- /vexp -->