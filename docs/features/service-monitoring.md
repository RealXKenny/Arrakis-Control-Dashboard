# Service monitoring

Service status combines independent, member-safe Console readings. Every provider response is validated and projected before rendering; operator reasons, requester details, raw command output, credentials and privileged payloads are not returned.

## Restart countdown and history (N071)

The active restart queue is the only source of dashboard restart countdowns. It supplies structured entry IDs, `counting`/`restarting` states, numeric restart times and battlegroup/map/service targets. Reads are coalesced for 15 seconds, the visible browser view refreshes every 20 seconds, and failures or hidden documents clear the reading. Countdown text says when play may be interrupted; it does not treat an estimate from unstructured output as confirmed. Verified restart history separately reports completion/failure, timestamps and duration without calling a restart an incident.

The documented daily-restart and IP-change endpoints return command output, not a stable structured next-run timestamp. The dashboard therefore does not invent their dates, canceled states or countdowns. Active-queue changes require a reload in the calendar. Upcoming published events and active queue entries also appear in the actionable inbox's Events and Maintenance categories, subject to the member's existing notification preferences.

## Health and restart timeline (N072)

A leased background worker reads `GET /api/server/status?raw=0` once per minute with a five-second provider deadline and no automatic provider retry. It stores only the observation time, sanitized overall state, and bounded game-map/status pairs. Provider failure becomes an **unavailable probe observation**, never proof that the game server is down. Redis retains seven days, caps reads and storage at 10,081 observations, and expires the key after eight days. Standalone and Cluster use the same single sorted-set key per Console origin.

The timeline derives separate degraded, outage and unavailable episodes. Exact duplicate observations are collapsed. A different non-healthy state starts a new severity episode; a gap over three minutes ends coverage without establishing recovery; only a later healthy reading records recovery. Ongoing means the latest non-healthy observation is recent, not that its root cause is known. Members can filter health observations separately from verified restart rows. Health storage and restart-history failures remain independent and explicit.

The worker follows `docs/architecture/background-workers.md`: one responsibility, a cross-instance Redis lease, timeout, retry budget and no HTTP entry point. It performs no Console mutation or game write. Focused unit tests cover projection, deduplication, state changes, gaps, recovery and sanitization. `tests/integration/redis-health.test.ts` covers real standalone/Cluster persistence when a disposable target is configured; the browser suite covers filtering, mobile layout and automated accessibility.

## Population activity (N073)

The existing recorder stores one aggregate online-player observation per minute for seven days, capped at 10,081 entries. The portal groups observations by the viewer's local weekday/hour, reports sample counts and observed busy/quiet hours, and distinguishes missing data from a real zero. It does not predict future activity.

The structured status response provides only aggregate population. Although the restart-queue endpoint accepts a map query, its implementation can fall back to the battlegroup-wide count when the scoped read fails, so the response cannot reliably establish per-map historical coverage. The dashboard consequently keeps per-map/per-server filters unavailable rather than mislabeling aggregate values as map data.

## Verification and limitations

Focused monitoring and inbox unit/API suites, the production build and smoke tests, and status/inbox Chromium tests cover authorization, independent source failures, sanitization, preference controls, 390px layout and axe accessibility. Native screen readers, physical devices and a live Console deployment remain unverified. No daily/IP-change schedule parsing, per-map population inference, incident-cause inference or restore-rehearsal claim is added.
