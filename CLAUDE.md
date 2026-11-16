# Arrakis Control Dashboard — Claude Code

## 1. Authoritative project instructions

Read `AGENTS.md` before beginning any work. It is the authoritative project contract, including the **Next.js-generated managed block**.

- Never modify, duplicate, relocate, or regenerate the managed block.
- Read `docs/architecture/file-organization.md`.
- Consult `docs/architecture/repository-inventory.md` before structural changes.
- Inspect the actual repository before making assumptions.
- If instructions conflict, follow `AGENTS.md` and report the conflict.
- Never assume historical documentation accurately represents the current working tree.

## 2. Project technology

The Arrakis Control Dashboard uses:

- Node.js 22+
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- npm
- Redis standalone and Redis Cluster
- Vitest
- Playwright
- GitHub Actions

**Redis is the only persistent database.**

Never introduce PostgreSQL, MySQL, SQLite, Prisma, or another persistent database without explicit authorization.

Respect existing Redis architecture, key naming, cluster compatibility, connection handling, and durability requirements.

## 3. Autonomous development

Claude is authorized to independently:

- Inspect and understand the repository.
- Implement requested features.
- Fix bugs and regressions.
- Refactor related code when necessary.
- Add and update tests.
- Improve TypeScript types.
- Run formatting, linting, testing, and builds.
- Update relevant documentation.
- Create development commits.
- Push ordinary commits to the current authorized development branch.
- Create and update pull requests.
- Post relevant GitHub PR comments.
- Inspect CI failures and fix issues introduced by its changes.

Do not repeatedly request permission for operations already authorized by Claude Code settings.

Never interpret tool permission as authorization to expand the task's scope.

## 4. Working method

1. Inspect `git status`, the active branch, relevant files, `AGENTS.md`, and actual package scripts.
2. Identify the smallest appropriate implementation scope.
3. Preserve unrelated changes and work from other developers.
4. Follow existing architecture and established conventions.
5. Implement changes incrementally.
6. Add focused regression tests.
7. Run relevant verification.
8. Investigate and fix failures caused by the changes.
9. Review the final diff for unintended modifications.
10. Commit verified changes when authorized.
11. Push to the current authorized development branch.
12. Report outcomes and remaining limitations.

Do not use `git reset`, `git clean`, destructive checkout operations, or history rewriting without explicit approval.

## 5. Architecture and file organization

- Place feature logic under `src/features/<domain>/`.
- Keep Next.js route handlers thin.
- Reuse existing services, utilities, components, and types.
- Maintain clear server/client import boundaries.
- Avoid circular dependencies.
- Avoid duplicate implementations.
- Preserve established naming conventions.
- Keep the repository root organized.
- Do not create unnecessary documentation or temporary files.
- Place tests beside relevant modules or in their established test directories.
- Update the repository inventory when structural changes warrant it.

Do not reorganize unrelated code simply because a different layout is preferred.

## 6. Security requirements

Security is a mandatory part of every implementation.

Preserve:

- Authentication and authorization boundaries.
- Server-side entitlement checks.
- Input validation.
- Rate limiting.
- CSRF protections where applicable.
- Sensitive data redaction.
- Audit integrity.
- Idempotency guarantees.
- Redis Cluster compatibility.
- Secure session handling.
- Least-privilege access.

Never expose secrets, tokens, credentials, private keys, or internal service endpoints in client-side code, logs, PR comments, or commits.

Never weaken security checks merely to make tests pass.

Do not modify production credentials or environment files without explicit approval.

## 7. Redis and background workers

Redis is the project's only persistent database.

- Support standalone Redis and Redis Cluster where required.
- Preserve existing key naming and hash-tag conventions.
- Avoid unsupported cross-slot operations.
- Maintain atomicity where necessary.
- Preserve idempotency and recovery behavior.
- Avoid unbounded key growth.
- Use appropriate TTLs.
- Never execute destructive Redis commands against live data.
- Keep test Redis instances isolated from production.

Background workers must use explicit server-side execution boundaries.

Workers must:

- Authenticate their internal execution context.
- Validate work items.
- Enforce authorization and entitlement rules.
- Use durable idempotency identifiers.
- Record processing outcomes.
- Handle uncertain external results safely.
- Avoid blindly retrying non-idempotent operations.
- Respect retry budgets and backoff.
- Prevent duplicate financial or reward operations.

Do not recreate public administrator APIs as a workaround for removed administration features.

## 8. Git and commits

Claude may automatically stage, commit, and push ordinary development changes to the current authorized branch.

Before committing:

- Inspect the working tree.
- Review staged changes.
- Exclude secrets and generated artifacts.
- Preserve unrelated developer changes.
- Run applicable checks.
- Use meaningful commit messages.

Commit messages must:

- Describe the actual changes.
- Follow established repository conventions.
- Avoid unnecessary AI branding.
- Avoid automatic `Co-Authored-By: Claude` trailers when attribution is disabled.
- Never claim tests passed unless they were executed successfully.

Do not amend or rewrite another developer's commits without approval.

Do not force-push, merge, rebase, delete branches, or bypass branch protection without explicit approval.

Do not automatically push directly to `main` or another protected branch.

## 9. GitHub pull requests

Claude may:

- Create development pull requests.
- Update PR descriptions.
- Post progress updates.
- Reply to review comments.
- Explain implemented fixes.
- Inspect failed checks.
- Update PR checklists.
- Report verification outcomes.

Do not merge or close pull requests without explicit approval.

Never dismiss another developer's review or mark unresolved concerns as resolved without addressing them.

### PR comment style

Write comments naturally, professionally, and concisely on my behalf.

Do not manually append:

- `Addressed by Claude Code`
- `Generated by Claude Code`
- `Written by Claude`
- AI attribution footers
- Robot emoji signatures
- Promotional links to Claude
- Unnecessary AI-generated disclaimers

Do not impersonate another GitHub account or falsify the identity of the actual author.

Use the authenticated GitHub identity and respect any attribution automatically required by GitHub or its integrations.

If an external automation adds attribution that cannot be configured away, report the limitation instead of claiming it was removed.

PR comments should describe what changed, why it changed, and what verification was completed.

## 10. Verification

Use the actual scripts available in `package.json`.

### Standard checks

- `npm run format:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`

### Runtime and API changes

Additionally run:

- `npm run build`
- `npm run test:production`

### Browser and UI changes

Run:

- `npm run test:browser`

Or focused Playwright tests when appropriate.

Test desktop and mobile behavior, keyboard navigation, accessibility, and reduced-motion preferences when relevant.

### Redis integration

Run `npm run test:integration` only with explicitly configured test-only Redis infrastructure.

Never use production Redis as a test database.

### Verification integrity

- Never fabricate test results.
- Distinguish pre-existing failures from new regressions.
- Do not silently skip failing checks.
- Do not disable tests merely to achieve a passing result.
- Record relevant commands and outcomes.
- Clearly identify tests that could not be run.
- Do not claim live-service verification without performing it.

## 11. Dependencies

Use npm as the package manager.

- Preserve package-lock consistency.
- Avoid unnecessary dependencies.
- Prefer existing libraries.
- Check compatibility with Node.js 22+, Next.js 16, and React 19.
- Review dependency security implications.
- Avoid unnecessary major-version upgrades.
- Do not install globally or execute remote installation scripts without approval.
- Do not automatically run dependency migrations against live services.

## 12. CI and GitHub Actions

Claude may inspect workflows, investigate failures, and improve relevant CI configuration.

- Preserve required checks.
- Preserve merge-queue compatibility.
- Do not bypass branch protection.
- Avoid unnecessary workflow duplication.
- Do not expose secrets in CI logs.
- Keep workflows reproducible.
- Do not claim hosted CI success from local results.
- Do not alter repository rulesets without approval.
- Do not modify GitHub secrets or runner infrastructure without approval.

### Git permissions and automatic commits

Claude is authorized to stage, commit, and push ordinary development changes to the current authorized development branch.

- Use the configured Bash permission rules for Git operations.
- Do not repeatedly request approval for already authorized operations.
- Respect the active permission mode and all permission-layer decisions.
- If a command is blocked by the auto-mode classifier, report the exact blocked operation and request a permission change.
- Never bypass permission restrictions or use alternate commands to evade a block.
- Never force-push, merge, rewrite history, or push directly to protected branches without explicit approval.
- Preserve unrelated work and verify staged changes before committing.
- Report the commit hash and push result after successful execution.

### Commit authorship and attribution

All commits must use the authenticated Git user's configured identity.

- Never add `Co-Authored-By: Claude`, `Co-Authored-By: Claude Sonnet`, or any other AI co-author trailer.
- Never add `Generated by Claude Code`, `Written by Claude`, or similar AI attribution.
- Never manually insert AI attribution into commit messages, PR descriptions, or comments.
- Respect the `attribution.commit` and `attribution.pr` settings.
- Use clean, conventional commit messages that describe the actual changes.
- Do not alter `git config user.name` or `git config user.email` to impersonate another contributor.
- Before committing, inspect the complete proposed commit message and remove any AI attribution trailers.
- If a repository hook or integration automatically inserts attribution, report it rather than bypassing the hook.

Example:

`fix(ci): format docs and align season integration test with new-progress-only sync`

Do not append any co-author trailer.

## 13. UI and accessibility

Follow the dashboard's established visual identity.

- Maintain consistent spacing, typography, and component behavior.
- Support desktop, tablet, and mobile layouts.
- Preserve responsive navigation.
- Support keyboard accessibility.
- Respect reduced-motion preferences.
- Avoid unnecessary animation.
- Maintain accessible contrast and interaction states.
- Preserve loading, empty, error, and offline states.
- Avoid introducing unnecessary visual complexity.

Do not replace established UI patterns without a clear reason.

## 14. Documentation

Update documentation only when relevant.

Possible documentation changes include:

- Architecture documentation.
- Repository inventory.
- Feature documentation.
- Environment variable templates.
- API contracts.
- Changelog.
- Testing instructions.
- Deployment documentation.

Do not duplicate documentation unnecessarily.

Never modify the protected Next.js-generated managed block in `AGENTS.md`.

## 15. Collaboration

Assume other developers may be working in the repository simultaneously.

- Preserve unrelated changes.
- Avoid unnecessary file-wide formatting.
- Do not overwrite another developer's uncommitted work.
- Avoid modifying files outside the requested scope.
- Inspect changes before staging.
- Prefer focused commits.
- Do not automatically resolve conflicts by discarding work.
- Report conflicts requiring human decisions.

## 16. Operations requiring approval

Explicit approval is required before:

- Merging pull requests.
- Force-pushing.
- Rebasing shared branches.
- Deleting branches or tags.
- Rewriting Git history.
- Deploying to production.
- Modifying production infrastructure.
- Changing GitHub rulesets.
- Changing repository secrets.
- Rotating credentials.
- Performing destructive Redis operations.
- Executing production database migrations.
- Publishing packages or releases.
- Performing destructive filesystem cleanup.

Tool availability does not override these restrictions.

## 17. Response format

After completing work, provide a concise report covering:

1. **Summary:** What changed and why.
2. **Files:** Important affected files.
3. **Verification:** Commands run and their outcomes.
4. **Security:** Relevant security considerations.
5. **Documentation:** Documentation updated or intentionally unchanged.
6. **Git:** Branch, commit, push, and PR status.
7. **Remaining work:** Known limitations, blockers, and unverified items.

Clearly distinguish completed work from planned work.

Do not claim a commit, push, PR update, deployment, or test succeeded without confirmation.

## 18. Final operating principle

Work autonomously within the authorized scope.

Prioritize correctness, security, maintainability, and compatibility with existing architecture.

Avoid unnecessary approval requests for routine operations, but never treat autonomy as permission for destructive actions or production changes.

When uncertain, inspect the repository and existing implementation before making assumptions.

`AGENTS.md` remains the final authority for project-specific instructions.
