# Event registration and waiting lists (N075)

Published upcoming/open community events with a future start can accept registrations from signed-in members. Registration closes at the reported start, when the event ends, or when it is cancelled/completed. An unscheduled event never receives a guessed registration deadline.

Each event has fixed bounds of **100 attendee seats and 100 waiting-list positions**. A full attendee list offers a waiting list; when both are full, registration fails closed. Members can cancel a registration or leave the waiting list. Cancelling an attendee seat while registration remains open promotes exactly one waiting member, selected by original waiting time and then account ID as a deterministic tie-breaker. Cancellation after closure or event cancellation does not promote anyone.

## Privacy and integration

The event card shows aggregate attendee/waiting counts and only the caller's own status and waiting-list position. It never returns an attendee roster, account IDs or another member's identity. The calendar includes the same own-status context without changing the event's own confirmed/tentative state. Event inbox alerts include registered/waiting context; a registration-storage failure marks the Events source partial while preserving public event alerts. Existing per-account notification preferences control presentation only.

`GET /api/v2/events/[eventId]/registration` returns the caller-relative summary. `POST` accepts only `{ action: 'register' | 'cancel', revision }` with a 2 KiB JSON body, same-origin protection and twelve writes/account/minute; reads allow thirty/account/minute. Both fail closed when rate-limit storage is unavailable. Event IDs come from the route, ownership only from the verified session, and responses are no-store. Stale revisions return 409 so the member can refresh rather than overwrite a newer state. Successful changes emit a redacted audit event.

## Atomic storage and retention

Registrations live at `arrakis:{community-events}:registration:<eventId>`, beside the event hash in the same Redis Cluster slot. The mutation script reads both keys atomically. It rechecks the current published event, exact schedule, deadline, caller revision, duplicate status and capacities before writing. Concurrent last-seat attempts therefore have one winner; a stale tab cannot register into an outdated event or overwrite a newer cancellation/promotion. Repeating the same registration with its current revision is an idempotent no-op. There are no automatic mutation retries.

Each account has one entry containing only `registered`/`waiting` and its original join timestamp. A UUID revision fence remains after the last cancellation to reject stale writes. Reads validate field counts and bounded JSON, and storage/read failures are explicit. Keys have 90-day inactivity retention refreshed by reads and writes. Redis remains the only datastore; no game permission, inventory, currency or Console mutation is involved.

## Verification

Unit/API tests cover summary privacy, fixed bounds, deadlines, authorization, same-origin writes and request-protection failure. Browser coverage exercises persistent registration and cancellation, cross-member privacy, calendar status, 390px layout and axe accessibility. `tests/integration/redis-event-registrations.test.ts` covers real standalone/Cluster Lua behavior: duplicates, last-seat races, one exact promotion, full waiting lists, cancellation and deadline closure. It requires a disposable loopback Redis target and must not be run against production data.
