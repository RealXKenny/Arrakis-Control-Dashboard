# Dunedocker integration

The Pages Router API boundary remains `runPagesApiHandler`. Server modules use the local `assert-server` guard, never the RSC package.

## Ownership

- `src/infrastructure/dune.ts`: Console session lifecycle, CSRF headers, adapter credentials and the compatible client entry points.
- `src/infrastructure/dunedocker/transport.ts`: typed HTTP methods, prefix-preserving URL construction, timeouts, JSON parsing, safe provider errors and structured tracing.
- `src/modules/player/server/linked-player.ts`: runtime validation and normalization of the linked-character response. Provider-only fields are not returned to the browser.
- Other feature server modules narrow unknown provider values before using their own domain transformations.
- `src/modules/bases`: private JSON import only. Community gallery and separate Solido views/endpoints are removed; import is under My bases.

## Diagnostics

Set `API_DEBUG_ENABLED=true` in server configuration to capture the latest response per source, method and path under gitignored `debug/api/`. The example defaults to false; the local troubleshooting setting remains enabled. Legacy dumps were purged. Tests disable runtime file capture or mock storage.

Snapshots preserve arrays and strings, redact credentials and identity keys, mask configured secrets inside text, omit error-text fields and auth response bodies, and safely serialize circular references and big integers. Query strings, request bodies and request headers are not captured. Stable filenames include a path hash to avoid collisions; unique temporary files and atomic renames prevent partially written snapshots. Files are private operational data and must not be publicly served. Concurrent processes use last-completed-write semantics; separate replicas retain their own filesystem snapshots. Filesystem failures never change API responses. Turn capture off after troubleshooting.

`LOG_LEVEL=DEBUG` enables transport metadata through `src/lib/logger.ts`: trace ID, provider, method, path, status, attempt and duration. Full redacted payloads stay in isolated snapshot storage instead of normal console/Sentry logs. Raw provider error messages and causes are not attached to thrown errors.

## Failures and retry policy

Read requests may retry transient network/5xx failures, at most three attempts. Ordinary requests have a 30-second per-attempt timeout; adapter player lookups use 15 seconds and multipart imports 60 seconds. Mutation failures are never automatically replayed. A 429 is returned without retry, and a 403 never triggers authentication. Console session recovery occurs once on 401; multipart recovery is disabled by default. Empty responses normalize to null; malformed or non-JSON responses become safe provider errors, including when an upstream proxy returns HTML. Domain handlers continue to use safe public error envelopes.

## Private base import

Imports validate the JSON, origin and login; resolve the target pawn from the signed-in Discord user; and ignore any client-supplied player target. Redis reserves each operation before the write, limits attempts to 10 per UTC day, and prevents replay of the same operation ID for 48 hours. Failed or ambiguous deliveries are marked unconfirmed and never automatically retried. Console has no native idempotency key: check the backpack/Console audit before initiating a new operation after uncertainty. No live game writes were performed during verification.

Supported input is a Console base-export JSON with instances and placeables, at most 512 KiB. Other native blueprint formats and community publishing remain out of scope.

## Verification

Typecheck, zero-warning lint, 90 Vitest tests, production build/smoke and 15 Playwright tests passed. Desktop/mobile import screenshots were reviewed. Validation used fixtures; deployment, real Redis persistence and a real game import remain operational acceptance steps.
