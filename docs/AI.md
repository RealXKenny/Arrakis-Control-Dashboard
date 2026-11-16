# AI coding agents

The single guide for coding assistants working in this repository. The canonical contract is [`AGENTS.md`](../AGENTS.md); do not duplicate its architecture policies in agent adapters. `AGENTS.md` contains a Next.js-generated managed block that must never be edited by hand.

## Supported integrations

Instruction discovery is version-dependent; verify the loaded instructions in each tool. These files guide agents and do not sandbox commands or enforce permissions.

| Tool                                   | Native files                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code                            | `CLAUDE.md`, `.claude/settings.json`, `.claude/rules/`                                                                                           |
| OpenAI Codex, AGENTS-aware             | `AGENTS.md`, optional `.codex/config.toml`; companions [`CODEX.md`](../CODEX.md), [`KIMI.md`](../KIMI.md)                                        |
| GitHub Copilot                         | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` (`applyTo` frontmatter)                                              |
| Gemini CLI                             | `GEMINI.md`                                                                                                                                      |
| Cursor, Windsurf, Cline, Roo, Continue | `.cursor/rules/arrakis.mdc`, `.windsurf/rules/arrakis.md`, `.clinerules/01-arrakis.md`, `.roo/rules/01-arrakis.md`, `.continue/rules/arrakis.md` |
| Aider                                  | Pass `--read AGENTS.md` explicitly                                                                                                               |

For any tool without confirmed discovery, attach `AGENTS.md`. Copilot loading depends on the IDE and product; enable repository and path-specific instructions and verify they are used.

## Set up and verify

1. Review native settings for your assistant (`.claude/settings.json`, `.codex/config.toml`). Global settings and trust policies can override project settings. Do not bypass permission checks.
2. In Claude Code use `claude doctor`, `/status` and `/model`; in Codex verify the active sandbox and approval settings.
3. Run `npm run ai:check`, then the standard checks. The validator checks repository files and static structure only; it cannot verify installed assistant behavior.
4. Review Git diffs before using new settings. Instructions do not replace isolation, code review, or authorization for Git writes and production operations.
5. When importing configuration from an archive, extract to a temporary folder, merge rather than overwrite, preserve the live Next.js block in `AGENTS.md`, and keep `.github/` workflows intact. New root instruction files need a reason in the [repository inventory](architecture/repository-inventory.md) and an architecture-test allowlist entry.

## Rules for every agent

- **Architecture:** `AGENTS.md` and [file organization](architecture/file-organization.md) are authoritative. `src/app` and `src/pages/api` are routing; `src/features` owns domains; `src/components` shared UI; `src/server` request infrastructure and integrations; `src/lib` focused helpers; `src/config/env.ts` the environment schema. Redis (standalone or Cluster) is the only persistent store. Do not recreate `src/modules`, `src/infrastructure` or `public`. Read live source rather than the historical inventory.
- **Conventions:** minimal, domain-owned changes; TypeScript types at API boundaries; validate external payloads as `unknown`; no unrequested dependencies or stores; follow the Obsidian/Sand/Spice design system with accessible, responsive, reduced-motion-aware UI. Read the installed Next.js docs before framework changes.
- **Security:** fresh server-side authentication and authorization for protected operations; preserve nonce CSP, same-origin mutation checks, no-store responses, bounded inputs, sanitization, audit logging and redaction. Keep `DUNE_API_KEY`, `DUNE_ADAPTER_TOKEN` and `BOT_API_TOKEN` distinct. Never print `.env`, rotate credentials, run production rekeys or deploy without explicit authorization.
- **Testing:** `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`; runtime and API changes also `npm run build` and `npm run test:production`; UI changes need relevant Playwright runs. Redis integration tests need a disposable `TEST_REDIS_URL` or `TEST_REDIS_CLUSTER_NODES`. Never weaken tests; never call a failure fixed without rerunning it. Unset local secrets (`REDIS_URL`, `AUTH_SECRET`, `DUNE_*`, `APP_URL` and similar) when running unit tests, or they cause false failures.
- **Git:** inspect status first, preserve other work, stage only task files, no AI attribution trailers, and ask before pushing, merging or deploying unless authorized.

## Investigating browser failures

Record `git status` and versions, run `npm run test:browser` against test configuration (never production), capture the full report, group failures by root cause (selectors, routes, auth fixtures, mocks, layout, timing, real regressions), reproduce one per group with focused Playwright runs, fix the app when it is wrong and change assertions only when the intended behavior is demonstrably different, then rerun and record before and after counts. Historical counts are not a baseline.

## Review checklist

- Scope, target branch and working tree inspected; `AGENTS.md` and ownership followed.
- No secrets, `.env`, generated files or unexpected assets added.
- Server/browser boundaries, authentication and ownership checks preserved; Redis standalone and Cluster considered.
- Focused tests added; failures attributed with evidence; format, typecheck, lint, unit, build and browser checks run as applicable.
- Docs, changelog and architecture inventory updated; diff reviewed; no unrequested destructive operation.

## Current work: intelligent automatic seasons (2026-11-16)

Design and files are in [automatic seasons](features/automatic-seasons.md). The user chose direct, server-validated claiming for generated seasons (no administrator approval); legacy seasons keep reviewed delivery. Committed on `v2`: personal plans, themes and simulation; separate `DUNE_ADAPTER_TOKEN`; manual claiming with component-level delivery; the catalog-backed reward economy. Remaining:

1. A browser test that clicks Claim Reward end to end with an offline fake member and asserts exactly one game write per component.
2. Historical learning: nothing populates `history.kindCounts` in `buildAssignment` yet.
3. Multiple characters: no verified roster API; claims bind to the linked character at first claim.
4. Character XP rewards stay disabled because Console `add-xp` returns no verifiable receipt.
5. Uncertain deliveries always need an administrator; there is no reliable automatic reconciliation evidence.
6. Item categories were not checked against a live Console; check the "Excluded N item(s)" notes and adjust the tier patterns in `engine/economy.ts`.
7. The level cap of 200, live provider staging and XP gains at the cap are unverified.
8. Push `v2`, read CI (Redis and Cluster integration tests have not run locally) and post a PR #8 comment with real results.
