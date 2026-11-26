# GitHub branch rulesets

This guide documents the repository's workflow integration and a read-only snapshot of GitHub settings inspected on 2026-11-10. No branch protection or ruleset settings were changed.

## Branches and current ruleset

The repository's default branch is `main`. The active ruleset **Production Branch Protection - Hardened** applies to the default branch and `release/*`. Its current rules require a pull request, one approval, dismissal of stale approvals, code-owner review, approval of the last push, resolution of review threads, an additional approval for unattributed changes, signed commits, and linear history. It restricts deletion and non-fast-forward updates, allows squash merges only, and has no bypass actors.

The current ruleset does **not** require a status check and does not enable a merge queue. The classic branch-protection endpoint is not configured. The `v2` branch exists but is not included in this ruleset. If `v2` remains a maintained branch, add `refs/heads/v2` to the ruleset after confirming that its protection should match `main`.

The ruleset requests code-owner review, but there is no tracked `CODEOWNERS` file. Add an appropriate ownership file if specific owners are intended to be required; do not invent owners as part of this workflow change.

## Recommended required status check

| Workflow                              | Exact check name                                          | Trigger                                                                 | Required | GitHub verification                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI                                    | `CI / Required Checks`                                    | Pull requests, pushes to `main`, `v2`, and `release/*`, and merge queue | Yes      | [Passed on the reviewed V2 workflow](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42913774394); use the final release-commit run for the maintainer decision. |
| Dependency Review                     | `Security / Dependency Review`                            | Pull request opened, reopened, synchronized, or marked ready            | No       | Runs when dependency changes require review; it does not cover merge queues.                                                                                                          |
| CodeQL (GitHub-managed default setup) | `Analyze (actions)` and `Analyze (javascript-typescript)` | GitHub-managed analysis                                                 | No       | [Both jobs passed](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42913782903); keep them optional unless their PR and queue coverage is confirmed.             |
| Redis Cluster Integration             | `Redis Cluster Integration`                               | Pushes to `v2`, weekly schedule and manual dispatch                     | No       | [Six-node Cluster suite passed](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42913774488); intentionally outside the required aggregate.                      |

For the required check, select **GitHub Actions** as the source. Require only `CI / Required Checks` initially: it already includes formatting, lint, type checking, docs and AI configuration validation, workflow checks, tests, production smoke, browser shards, and standalone Redis integration. Do not select the optional check names above as merge requirements.

## Merge queue

CI supports merge queues through the `merge_group` / `checks_requested` trigger. If enabling a queue, select the same `CI / Required Checks` status in the queue's required checks. Dependency Review and the separate Cluster workflow are not queue checks and must remain optional. Merge queues are not enabled automatically by this repository.

## Recommended protections

For `main` and any maintained `release/*` branches, retain the current pull-request, review, signed-commit, linear-history, deletion, force-update, and squash-only restrictions. Require `CI / Required Checks`. Keep bypass access empty or limited to the smallest explicit emergency group; avoid administrator bypass where operationally possible.

For `v2`, decide whether it is still an active integration branch. If it is, include it in the ruleset and require the same stable CI gate. The workflow already runs on pushes to `v2` and pull requests targeting it.

Keep one approval as the current baseline unless the team has a reason to require more. Continue dismissing stale approvals, requiring approval of the last push, resolving review conversations, and requiring code-owner review only after an ownership file defines reviewers. Restrict force pushes and branch deletion; retain signed commits and linear history if they match the team's contributor workflow. The current ruleset already allows squash merges only.

## Manual setup

1. Open the repository on GitHub.
2. Go to **Settings → Rules → Rulesets**.
3. Create or edit the branch ruleset for the protected branch.
4. Select `main` and `release/*`; also select `v2` only if it is intended to be protected.
5. Enable pull requests before merging.
6. Configure at least one approval, stale-review dismissal, last-push approval, conversation resolution, and code-owner approval when a `CODEOWNERS` file is present.
7. Enable required status checks.
8. Select the exact check name **`CI / Required Checks`**.
9. Select **GitHub Actions** as its source.
10. If using a merge queue, enable it for that branch and require the same CI check. The workflow already listens for merge-group checks.
11. Review bypass actors, force-push, deletion, signed-commit, linear-history, and allowed merge-method settings; use the minimum bypass permissions.
12. Save in enforcement mode after the final release workflow has completed successfully on GitHub.

To replace obsolete required checks, first confirm `CI / Required Checks` has succeeded for a pull request (and a merge-group entry if using a queue). Then update the ruleset to add the new exact check and remove the obsolete contexts in the same maintenance window. Do not leave a branch temporarily without a required check.

## Manual GitHub validation still needed

The hosted PR evidence confirms the stable `CI / Required Checks` context. The remote ruleset still has no required status check, and merge queue is disabled. A maintainer must add that exact check through GitHub's ruleset UI and, only if a queue is wanted, verify it on a merge-group entry before enabling the queue. Do not infer hosted success from local YAML or test results, and do not change remote rulesets without separate approval.
