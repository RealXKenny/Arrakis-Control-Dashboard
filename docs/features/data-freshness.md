# Data freshness and outage indicators (N098)

The actionable inbox, pinned item counters, universal item finder and command-palette asset lookup show explicit successful-read and attempted-read timestamps. These are dashboard read observations, not a guarantee that every game field was sampled simultaneously or that upstream providers have no internal cache.

## Reading the indicators

| Indicator                                    | Meaning                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh                                        | A valid successful reading is younger than 60 seconds.                                                                                            |
| Stale                                        | The reading is at least 60 seconds old; refresh explicitly before relying on it.                                                                  |
| Partial coverage                             | Some readings/sources are missing, excluded or limited. Fresh partial data is not an all-clear or a complete zero.                                |
| Checking                                     | An explicit read is in progress. The previous success time is unchanged.                                                                          |
| Outage / check failed                        | The latest read failed or could not be confirmed. This also covers request-limit/transport failures; it does not diagnose which provider is down. |
| Paused · refresh required                    | A read was cancelled or the document was hidden. Private results are cleared; refresh explicitly.                                                 |
| Unsupported / link required / not applicable | The source cannot currently provide this monitoring capability. No success time is invented.                                                      |
| Freshness unknown                            | No valid success timestamp is available in this view/context.                                                                                     |
| Clock difference                             | The server timestamp is over five seconds ahead of the device clock. Freshness is unknown until the clock difference is resolved.                 |

Times are rendered as explicit UTC ISO timestamps using semantic `time` elements. **Last attempt (device time)** is separate from **Last successful read**, which comes from server response/source metadata. A failed or cancelled request never advances the successful-read time. While the page is visible, a five-second local timer ages the label; it never polls the network, scans inventory, changes notifications or performs a game action. No animation, sound or repeated live-region announcement is added.

History is **in memory for the current view and context only**. Reloading, leaving a view, changing the selected query/settings or reopening the command palette can reset it. N098 has no persistent private-outage archive, cross-instance success ledger, browser storage or source snapshot. Unknown history is stated explicitly. This deliberate boundary prevents old character/guild readings from becoming a new account's history. The separate N072 service-health worker stores only sanitized infrastructure observations; it does not weaken this private view-local contract.

## Inbox source timestamps

`GET /api/v2/inbox` retains its existing verified-session, request-budget, same-account and fresh guild membership boundaries. The response's `checkedAt` is the time the inbox response was assembled, shown separately as **Last successful inbox response**. It is not used as every source's last-success time.

Each source additionally contains:

- `readAt`: nullable UTC timestamp of the successful dashboard source read. Assets use the original profile cache entry's `capturedAt`; serving that 15-second cache again does not move the source time forward. Guild supply and operation reads record their own completion times, independently of each other.
- `context`: nullable SHA-256 context marker derived on the server from the session account and observed character, plus verified guild/member IDs for private guild sources. It is an opaque comparison hint, not an authorization token. Raw context IDs are never returned by these fields.

The browser retains only a source's timestamp/coverage metadata across failed reads with the same context. A new/null context, unlinked character, unsupported source or absent membership verification clears previous source success history. A storage failure after successful current-membership verification can retain the previous time for that same scope while showing outage. A failed whole response clears every private card and retains only safe view-local timestamp metadata; definitive session/access/link conflicts clear that history too.

The existing coverage notes and links remain visible after successful reads. During an outage, only category names and freshness metadata remain; no old private source details or alert cards survive. Changing visibility pauses the overall indicator and clears source histories/private readings. No automatic refresh occurs on return.

N021 generator monitoring, N025 personal stockpile thresholds and N042 price watches remain unavailable prerequisites. N098 does not create them or grant successful timestamps to unsupported monitoring engines. The existing profile cache remains non-atomic and account-scoped; a context marker describes that observation and never grants current destination access.

## Inventory and command lookup

The item finder and pinned counters derive successful observation time from the **earliest valid successful source timestamp**, not scan start time or a failed source's check time. A scan with no successfully read sources has unknown freshness. Partial/unknown quantities retain existing lower-bound presentation, never a fabricated complete zero.

Pinned counts now clear immediately when refresh starts, fails, is cancelled, settings change or the page hides. Failed refreshes cannot leave old quantities looking current. During a transport/storage outage, only the last successful timestamp can remain. Session/character-link conflicts clear success history. Pin settings and ownership still use the existing independent account/pawn/controller contract.

Storage also keys inventory tools to the server session account, observed character (or unavailable/link status) and finder query. A client-side layout/filter transition under a changed account/character remounts the tools and clears previous selections, counts and success metadata. The added regression reproduces the old retained-counter behavior under a changed disposable session before verifying the fix; server API authorization is unchanged.

Finder query changes cancel the active request and clear old results and history. The command palette does the same on query/mode changes and closes on document hiding; it labels existing `checkedAt` and partial coverage without extra requests. Both continue to require explicit authorized searches. Source timestamps describe read completion/observations, not asset ownership or permission leases; destination workspaces recheck access.

## Architecture, deployment and testing

`src/features/monitoring/freshness.ts` owns the browser-safe state/age/context policy. `components/data-freshness.tsx` and its CSS module render the shared feature indicator. Inbox, player tools and command lookup compose it without exposing server imports. The profile loader now carries optional `capturedAt`; older/missing metadata remains unknown rather than falling back to check time. Source schema defaults preserve compatibility with older source payloads missing the new fields.

There are no new endpoints, dependencies, environment variables, Redis keys, data migrations, workers, game writes or delivery changes. Existing PostgreSQL prohibition and standalone/Cluster contracts remain unchanged. Rollback is a normal application update; no stored freshness state needs migration or deletion.

Focused coverage is `tests/unit/monitoring/freshness.test.ts`, `tests/unit/portal/profile-freshness.test.ts`, the extended `tests/api/inbox.test.ts` and `tests/browser/freshness.spec.ts`. Tests check exact stale boundaries, invalid/future timestamps, cache reuse, failed/partial source reads, scope changes, unsupported monitoring, clear-on-outage/cancel/access failure, visibility, no polling, existing notification controls and mobile WCAG AA. Existing inbox/counter regression assertions now require private data to disappear while safe freshness metadata remains.

Browser tests use disposable accounts and simulated dates. Responsive checks cover 320/393/412/768/1440 widths, touch, reduced motion and automated WCAG AA. Visually reviewed running-app evidence: [desktop](../assets/screenshots/freshness-desktop.png) and [mobile](../assets/screenshots/freshness-mobile.png). Native Safari, physical devices and screen-reader products remain unverified. Exact full-suite and final-head CI results are recorded in PR #11's comments.

[N099 personal data controls](personal-data.md) are implemented. [N100 saved activity views](activity-views.md) are also implemented on `feature/personalization`. No merge or deployment is authorized by this feature.
