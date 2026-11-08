# Testing policy

Standard commands: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`. Runtime/API changes also require `npm run build` and `npm run test:production`; UI changes require relevant Playwright tests. Opt-in Redis integration tests must target test-only services. The uploaded inventory recorded 55 older browser failures, but that is not proof of the current baseline. Never mark failures as fixed without rerunning them and showing evidence.
