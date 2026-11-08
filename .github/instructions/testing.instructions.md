---
applyTo: "tests/**/*,vitest.config.mjs,playwright.config.ts"
---

# Testing instructions
- Keep tests domain-organized; use shared Playwright fixtures in `tests/helpers/`.
- Add deterministic regression coverage for behavior changes, especially authorization and boundaries.
- Run standard checks; run production smoke for runtime/API changes; use browser tests for UI.
- Real Redis integration tests are opt-in and must use test infrastructure, never production.
- Distinguish historical browser failures from current results; never weaken tests to get a green result.
