# Event submission gallery and judging (N076)

Each published event has a member submission gallery at `/events/<eventId>`. Signed-in members can submit one entry while the event is `open` and its reported end time is in the future. Unscheduled events and events without an end time do not receive an invented submission deadline.

An entry contains a 3–120 character title, 10–2,000 character evidence note, and one PNG, JPEG or WebP image up to 700 KiB. The server verifies the file signature, decodes a single static image with bounded input pixels, applies orientation, resizes to at most 1280 × 1280, strips metadata and re-encodes WebP. Processed images over 256 KiB are rejected. Raw uploads, SVG, arbitrary URLs, scripts and attachments are not stored or served.

## Ownership and visibility

The session account owns the entry. Before the deadline, the owner can edit a pending/rejected/withdrawn entry, which returns it to pending review, or withdraw an unjudged entry. A second entry from the same account is rejected. Events are capped at 25 submissions; every record and image has 90-day inactivity retention refreshed by reads/writes.

Approved entries are visible to members with their public author display name, title, note, evidence image and confirmed result. Pending, rejected and withdrawn entries are visible only to their owner and freshly authorized reviewers. Public responses exclude owner IDs, revisions and reviewer notes. Image reads recheck the same ownership/review/approved-state rules and use private, versioned, nosniff responses.

## Review and judging

`EVENT_REVIEWER_DISCORD_ROLE_IDS` is a separate optional role list. Review access is verified directly against current Discord guild membership on every privileged read/action and fails closed. Moderator, backup-viewer and guild-leader roles do not substitute for it.

Reviewers can approve or reject a pending entry with a bounded note while the event is open or judging. Only approved entries can receive a result, and only while the event is judging or completed. Results are `winner`, `finalist` or `not-selected`; there is at most one winner per event. Results remain `null` until a reviewer explicitly confirms them. Review and judging are separate audited actions, and no winner is inferred from approval, registration, submission time or event status.

## Storage and API

Submission metadata lives at `arrakis:{community-events}:submissions:<eventId>` and image blobs at `arrakis:{community-events}:submission-image:<eventId>:<submissionId>`. All mutation keys share the community-events Cluster slot. The Lua mutation rechecks revision, ownership, event status/end time, editable state, capacity, duplicate owner and single-winner rules atomically. Stale revisions and cross-owner edits fail without overwriting state; there are no automatic mutation retries.

- `GET /api/v2/events/[eventId]/submissions` returns permission-aware views.
- `POST` on that route accepts bounded multipart creation/editing, six uploads/account/hour.
- `POST /api/v2/events/[eventId]/submissions/[submissionId]` accepts owner withdrawal or reviewer review/judging JSON, with same-origin checks and 30 writes/account/minute.
- `GET .../[submissionId]/image` serves only the authorized processed WebP.

Unit/API tests cover public/private projection, image validation, reviewer/session authorization and image privacy. Browser coverage exercises real upload, editing, withdrawal, pending-entry privacy, 390px layout and axe accessibility. `tests/integration/redis-event-submissions.test.ts` covers real standalone/Cluster ownership, duplicate, review, deadline and single-winner behavior with a disposable target.
