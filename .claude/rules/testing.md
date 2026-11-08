# Testing and validation
- Tests live in `tests/api`, `tests/architecture`, `tests/browser`, `tests/deployment`, `tests/helpers`, `tests/integration`, `tests/load`, `tests/unit`.
- Prefer small deterministic regression tests for changed behavior.
- Use `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test` for standard verification.
- Run `npm run build` and `npm run test:production` for runtime, API, environment and infrastructure changes.
- Browser tests use `tests/helpers/browser-test.ts`; use focused Playwright runs when helpful.
- Redis integration tests require opt-in test Redis configuration; never point tests at production.
- The supplied inventory recorded 55 browser failures and 24 passes at that time. This is historical, not a current baseline: rerun and compare before attributing failures.
- Never weaken tests, fabricate passing results, or treat a passing build as browser verification.
