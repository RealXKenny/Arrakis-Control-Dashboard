# GitHub Actions

Workflows live in `.github/workflows/`. All third-party actions are pinned to full commit SHAs; the default token is `contents: read`
and only the release job has `contents: write`. No workflow uses `pull_request_target` or repository secrets. Dependabot proposes
weekly updates for GitHub Actions and npm (`.github/dependabot.yml`). A unit test (`tests/unit/release/workflow-security.test.ts`) guards these properties.

## `ci.yml` (pull requests and pushes to `main`)

| Job                         | What it runs                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checks` (matrix)           | One runner each: `typecheck`, `lint`, `format:check`, `test`                                                                                                 |
| `integration` (4 shards)    | `npm run build`, `npm run test:production` (shard 1), Playwright install, `npm run test:browser -- --shard=n/4`; uploads traces on failure                   |
| `redis-integration`         | `npm run test:integration` against a `redis:7.4-alpine` service (15-minute timeout)                                                                          |
| `redis-cluster-integration` | Starts six `redis:7.4-alpine` containers as a 3×(1+1) cluster, runs `npm run test:integration` with `TEST_REDIS_CLUSTER_NODES`. **Not yet part of the gate** |
| `verify`                    | Requires `checks`, `integration`, `redis-integration` to succeed                                                                                             |

`concurrency` cancels outdated runs on pull requests only. Node.js 22 with npm caching. The Next.js build cache is restored per lockfile hash.

## `ai-config.yml`

Runs `node scripts/maintenance/validate-ai-config.mjs` on pull requests and `main` pushes that touch the coding-agent configuration (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `docs/ai/`, …). It checks structure and JSON only. Same pinned actions and read-only token as the other workflows.

## `release.yml`

Triggered by a completed `CI` run. It proceeds only if CI **succeeded**, was a **push** to **`main`** of **this repository**; it re-checks that the commit
is on `main`, then:

1. Reads `package.json`'s version, skips if the tag already exists, requires a strictly greater stable SemVer than the previous tag.
2. Extracts the `## Patch Notes vX.Y.Z` section of `CHANGELOG.md` (must exist and be non-empty).
3. Builds the egg (`scripts/deployment/build-pterodactyl-egg.mjs`).
4. Builds `arrakis-control-dashboard-<version>.tar.gz` with `git archive`, writes and re-verifies the `.sha256`.
5. Publishes the release with those three files.

See [production release](production-release.md).

## Verifying the workflows (owner steps)

These have never run on GitHub from this branch; syntax and policy were validated locally only.

```bash
git push -u origin <branch>
gh pr create --base <target> --head <branch>
gh run list --branch <branch>
gh run watch
```

Check every job, especially the two Redis jobs. If `redis cluster integration` passes, add it to `verify.needs` (and to the `CI` job result check)
so it gates merges. The `redis:7.4-alpine` tag is moving; pin by digest if your policy requires, noting Dependabot will not update it inside a workflow.

## Branch protection (recommended)

Require the `verify` check and reviews on `main`, restrict who can push tags and create releases, and require signed commits if you wish. These are repository settings, not code.
