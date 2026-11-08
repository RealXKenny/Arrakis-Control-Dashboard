# Testing

## Layers

| Layer                | Command                         | Where                          | Needs                                  |
| -------------------- | ------------------------------- | ------------------------------ | -------------------------------------- |
| Unit and API         | `npm test`                      | `tests/unit`, `tests/api`, `tests/architecture`, `tests/deployment` | Node; installer tests also need `bash`, `jq`, `tar`, `sha256sum`, `find`, `readlink`, `awk` (they skip silently without them; CI runners have them) |
| Production smoke     | `npm run build` then `npm run test:production` | `tests/production/smoke.mjs` | Built app; starts fake Console and fake RESP Redis fixtures |
| Browser              | `npm run test:browser`          | `tests/browser`                | Chromium (`npx playwright install chromium`) |
| Redis integration    | `npm run test:integration`      | `tests/integration`            | A **disposable** Redis (below)         |
| Load                 | k6 script                       | `tests/load/dashboard.k6.js`   | k6 (not run in CI)                     |

## Unit and API (Vitest)

Config: `vitest.config.mjs`; includes `tests/**/*.test.ts`, audit output off, integration folder excluded unless `TEST_REDIS_URL` or
`TEST_REDIS_CLUSTER_NODES` is set. Architecture tests enforce import boundaries, API boundaries, acyclic dependencies, naming, retired
directories and the root-file allowlist. Add the smallest test that proves a fix. Do not skip or weaken tests to get green.

## Browser (Playwright)

`playwright.config.ts`: Chromium, one worker, base URL `http://127.0.0.1:3100`, CI retries 1. It starts `tests/helpers/browser-server.mjs`,
which runs the production server against a fake Console on port 3101 (`tests/helpers/fake-console.mjs`) and an in-process RESP Redis fixture.
Tests import `test`/`expect` from `tests/helpers/browser-test.ts`. A stale server on 3100/3101 causes `EADDRINUSE` or stale code; stop it first.
Failure traces are kept (`test-results/`, git-ignored). 81 tests existed at the last full run.

## Redis integration tests

Run the Lua scripts, sessions, rate limits, audit trail, guild/support handlers and the marketplace re-key CLI against a **real Redis**
(only the Discord session, linked-character lookup, Console and admin check are faked). **The target database is flushed before every test.**
Use a throwaway instance; the helper refuses non-loopback addresses.

Standalone Redis 7 (bash):

```bash
redis-server --port 6391 --save "" --appendonly no &
TEST_REDIS_URL=redis://127.0.0.1:6391/15 npm run test:integration
```

Redis Cluster (3 masters + 3 replicas, loopback; bash):

```bash
for p in 7001 7002 7003 7004 7005 7006; do
  mkdir -p /tmp/rc/$p && (cd /tmp/rc/$p && redis-server --port $p --bind 127.0.0.1 --cluster-enabled yes \
    --cluster-config-file nodes.conf --cluster-node-timeout 3000 --save "" --appendonly no &)
done
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 127.0.0.1:7006 \
  --cluster-replicas 1 --cluster-yes
TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003 npm run test:integration
```

PowerShell: set the variable with `$env:TEST_REDIS_URL = 'redis://127.0.0.1:6391/15'` first. The Cluster-only suite
(`redis-cluster.test.ts`) checks slot placement and performs a live `CLUSTER FAILOVER` of the marketplace shard (with `FORCE` as a fallback). It
is skipped on standalone Redis. The re-key CLI is executed from an empty temporary directory so it can never read a developer's `.env`.

In CI the `redis integration` job uses a `redis:7.4-alpine` service; the `redis cluster integration` job starts six containers and runs the same suite.

## Installer sandbox tests

`tests/deployment/installer.test.ts` runs the egg's **real installation script** with bash/tar/sha256sum/jq in a temporary directory;
`curl`, `npm`, `apt-get` and `chown` are shims serving local fixtures. They cover checksum success/failure, missing and malformed checksums,
version pinning, hostile archives (parent paths, absolute paths, symlinks, hard links) and unverified-release handling.

## What is not covered by automated tests

Real GitHub Actions runs, a real Pterodactyl panel, the real Discord round trip and Redis TLS/auth are verified manually ([staging](../deployment/staging.md)).
