# Browser suite remediation playbook

The supplied architecture inventory recorded **24 passed and 55 failed** browser tests at the time of that snapshot, with focused navigation checks passing. The archive cannot fix these tests without the actual repository, current test output and running app.

1. Record `git status`, Node/npm versions and the current branch.
2. Run `npm run test:browser` against the project's configured test environment; capture the full report, not only a summary. Do not use production credentials.
3. Group failures by root cause: outdated selectors, changed routes, auth fixtures, API mocks, visual/layout assertions, timing or genuine regressions.
4. Reproduce a representative failure from each group with focused Playwright commands; inspect traces/screenshots without leaking user data.
5. Fix app behavior when it is wrong; update assertions only when intended behavior is demonstrably correct. Never skip or weaken tests to manufacture green results.
6. Rerun focused tests and then the full suite. Record before/after counts and remaining failures in the PR.
7. Preserve accessibility and desktop/tablet/mobile coverage.
