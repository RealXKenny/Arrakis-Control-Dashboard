# Codex — Arrakis Control Dashboard

Codex reads the repository-root `AGENTS.md` as its primary project instructions. This companion document is for humans and optional explicit agent reference; it is **not** automatically loaded by Codex.

## First steps
- Read `AGENTS.md` and `docs/architecture/file-organization.md` before editing.
- Inspect `git status`, `package.json`, and the relevant feature code. Preserve uncommitted changes.
- Follow Next.js-generated agent guidance: inspect local `node_modules/next/dist/docs/` before changing Next.js APIs.
- Keep `src/app/` and `src/pages/api/` thin; domain logic belongs in `src/features/`.
- Redis is the only persistent store. Do not introduce PostgreSQL.
- Never recreate `src/modules/`, `src/infrastructure/`, or `public/`.

## Checks
Run the applicable subset of `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:production`, and browser/integration suites. Browser failures recorded in an older inventory are not evidence of the current baseline.

## Security and Git
Never expose secrets, run production migrations/rekeys, or deploy without explicit approval. Ask before commits, merges, pushes, rebases, branch deletion, and destructive commands. Do not mistake `workspace-write` for permission to modify unrelated files.

## Config
`.codex/config.toml` requests workspace-write sandboxing, no sandbox network, and on-request approval. Verify these settings in your installed Codex version and review your global config and policy, which may override project settings. Some Codex installations require the project to be trusted before project configuration is applied.
