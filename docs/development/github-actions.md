# GitHub Actions

The browser matrix installs Chromium and WebKit. In addition to the full Chromium suite, focused season cases run with desktop Safari/WebKit, iPhone/WebKit and Android touch-emulation projects across the existing four shards. WebKit uses an isolated HTTPS fixture with the production CSP intact. All matrix results remain covered by `CI / Required Checks`; no workflow permissions or protected-branch requirements are widened.

## Workflows

| Workflow                                                               | Purpose and triggers                                                                                                                                                                                                                                                                                                   | Required for merging                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [CI](../../.github/workflows/ci.yml)                                   | Runs on every pull request, pushes to `main`, `v2`, and `release/*`, and merge-queue `checks_requested` events. Covers code quality, documentation links/formatting, AI configuration, workflow validation, unit/API/architecture/deployment tests, browser tests, production smoke, and standalone Redis integration. | Yes: `CI / Required Checks`                                                      |
| [Dependency Review](../../.github/workflows/dependency-review.yml)     | Reviews pull request dependency changes and fails for known vulnerabilities rated moderate or higher.                                                                                                                                                                                                                  | No; it does not run for merge-queue events.                                      |
| [Redis Cluster Integration](../../.github/workflows/redis-cluster.yml) | Exercises the full real Redis Cluster integration suite on pushes to `v2`, weekly and on manual dispatch, retaining test logs and final topology for seven days.                                                                                                                                                       | No; this heavier compatibility check is intentionally separate from the PR gate. |
| [Release](../../.github/workflows/release.yml)                         | Runs after CI and publishes only a new stable release from a successful push to `main` in this repository. A read-only job validates the changelog/version and builds verified assets; a separate write-enabled job publishes the egg, source archive, and SHA-256 checksum.                                           | No; it is a protected publication workflow, not a PR check.                      |

GitHub's managed CodeQL default setup is configured for Actions, JavaScript, and TypeScript. It is not duplicated by a repository-owned CodeQL workflow. Its analysis jobs are useful security signals, but are not part of the required aggregate.

The AI adapter/configuration validator runs as `npm run ai:check` within CI. Keeping it in the main quality gate avoids a separate path-filtered check that could be absent from merge-queue runs.

There are no tracked Dockerfiles or Compose files to validate. The existing Pterodactyl egg installer is covered by the deployment tests included in `npm test`; release publication also generates and parses the egg JSON.

## Required gate and event behavior

Select **`CI / Required Checks`** as the stable required status check in the branch ruleset. It depends on every mandatory CI job and verifies that each result is exactly `success`. Failed, cancelled, or unexpectedly skipped jobs fail the aggregate. Mandatory jobs do not use `continue-on-error`.

The CI workflow intentionally has no path filters: edits to workflow files, tests, documentation, or application code all produce the same required check. Pull requests, pushes to the active protected branches, and merge-queue `checks_requested` events run the same gate. Concurrency cancels only superseded pull-request runs; merge-queue runs get separate run IDs.

Fork and Dependabot pull requests do not need repository secrets. Workflows grant read-only repository access, checkout does not persist its token in Git configuration, and no PR workflow deploys or publishes. CI does execute the proposed source and dependency lifecycle scripts, so the runner must remain secret-free and minimally permissioned.

## Security and dependencies

- Every workflow declares token permissions. The release job alone receives `contents: write`, and only after the trusted `workflow_run` checks confirm a successful push to `main`.
- Third-party actions use full commit SHAs. Dependabot checks for GitHub Actions updates weekly; review the action change and its new immutable SHA before merging.
- Dependency Review uses the official GitHub action, read-only permissions, and a moderate-or-higher vulnerability threshold. No license deny-list is configured because the repository has no documented license policy.
- Dependabot groups compatible npm and GitHub Actions minor/patch updates. Major updates remain separate, and nothing auto-merges.
- Browser failure traces are uploaded only on failure and retained for seven days. They use isolated fake services and test fixtures, not production credentials.
- Redis Cluster testing runs on `v2` pushes as well as scheduled/manual runs. It remains separate from `CI / Required Checks` and does not publish releases or change branch rulesets. Push-triggered V2 verification works before this new workflow reaches `main`; GitHub manual dispatch requires the workflow to exist on the default branch. The runner starts three masters and three replicas, runs the complete integration suite, records final topology, uploads results for seven days even on failure, and removes the disposable containers.

## Local validation

```powershell
npm run workflows:check
npm run ai:check
npm run docs:check
npm run docs:format:check
```

`docs:format:check` checks changed Markdown under `docs/` against the repository's Prettier configuration. `workflows:check` parses workflow and Dependabot YAML, checks permissions, explicit job names and timeouts, validates dependency references and immutable action pins, and verifies that the CI aggregate covers every other CI job. CI also runs actionlint 1.7.12 after downloading the official release archive and checking its SHA-256 digest.

## Troubleshooting

- **Required check is missing or pending:** confirm the PR targets a branch covered by the ruleset and that the `CI` workflow is enabled. Do not add path filters to its triggers.
- **Merge queue cannot find the required check:** confirm the queue is enabled for the intended branch and that the exact `CI / Required Checks` context is selected from GitHub Actions. The CI workflow listens for `merge_group` with `checks_requested`.
- **Aggregate fails while an upstream job looks green:** inspect every dependency in the aggregate; skipped and cancelled results are deliberately failures.
- **Dependency Review fails:** inspect its job summary for the changed package and vulnerability severity. Do not bypass the finding by making the workflow optional-check configuration look like a pass.
- **Release does not run:** releases are considered only after a successful CI push to `main`; the package version must be a new stable SemVer with a non-empty matching `CHANGELOG.md` section.

## Adding or changing workflows

Keep the workflow count small and each job purposeful. Use `pull_request` for untrusted PR code; do not run it in privileged `pull_request_target` workflows. Avoid path filters on required checks, declare the smallest permissions, add a timeout and stable job name, pin third-party actions to verified full SHAs, and do not expose secrets to fork or Dependabot code. Wire every mandatory job into the aggregate and keep optional or scheduled checks outside it. Validate changes with `npm run workflows:check`, actionlint, the applicable project checks, and `npm run docs:check` when Markdown changes. Branch rulesets and repository secrets are configured manually; workflows must not alter those remote settings.
