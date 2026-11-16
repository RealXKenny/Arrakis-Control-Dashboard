# Mobile quick actions (N096)

Open `/portal` to find **Field essentials → Quick actions** above the customizable widgets. The panel stacks on phones and tablets below 1024 pixels and uses three columns on larger screens. Inputs, buttons and action links have at least 48-pixel height, visible keyboard focus and wrapping text. It does not add a floating overlay, second navigation bar or another route inventory.

## Daily workflow

- **Find supplies:** enter an item name or template (up to 128 characters), then **Prepare supply search**. The native GET form opens `/storage?find=<encoded query>#finder-title`. The existing item finder receives the text; choose **Find items** there to execute its fresh, bounded, read-only search. Merely opening the portal or preparing a query does not scan inventories. No game guild is required. Storage requires a linked character and retains its existing permission checks and honest partial-coverage reporting.
- **Check bases:** open owned holdings or request the shared view. Holdings retains its existing behavior: when only one access group is available, that group is displayed; otherwise the requested owned/shared tab is selected. Only authorized profile bases appear. No bases, missing readings and profile failures keep their existing presentations. These shortcuts never publish blueprints, import bases or change inventory.
- **Operation briefings:** open `/guild?tab=operations` to read existing meeting points, schedules, role requirements and instructions. Guild profile and fresh membership checks remain at the destination. Opening a briefing never signs up, modifies an operation or acknowledges anything. Solo members get an explicit guild-required explanation; unlinked or unavailable profiles show that access is unconfirmed rather than inventing private briefings.

The quick-action panel is independent of N091 widget preferences, so hiding all widgets does not remove these entry points. Existing personal/full layouts, customizations, map switching and save/discard behavior remain intact. No new saved preference or historical snapshot is added.

## Architecture and security

`src/features/portal/components/quick-actions.tsx` is server-rendered inside the existing session-protected portal. It receives only a presentation hint (`member`, `solo`, `unknown`), never a roster, position or private operation record. The hint cannot authorize destination access. `quick-actions.module.css` owns responsive styles and introduces no animations; reduced-motion preferences are preserved.

`navigationItemFor` resolves IDs through the existing permission-filtered navigation inventory, including nested destinations. Quick actions use its Storage, Holdings and My Guild destinations and add only existing workspace-specific query/fragment values. No request-supplied URL, provider endpoint, owner selector or authorization override is accepted. Link prefetch is disabled to avoid speculative destination reads. The supply form and links work without JavaScript; interactive inventory search still requires the existing client-side finder.

There are no new API endpoints, Redis records, database migrations, environment variables, dependencies, background jobs, notifications or game writes. The existing adapter's identity lookup is a read-only POST and remains part of normal profile authorization. Mutation-free shortcut checks explicitly distinguish that lookup from resource mutations. Existing sessions, no-store responses, request bounds, throttles, role checks and source coverage remain authoritative.

## Verification and deployment

The focused browser suite is `tests/browser/quick-actions.spec.ts`. It exercises query encoding and explicit live fixture search, owned/shared selection, an actual saved operation read by an ordinary member, no automatic sign-up, unlinked/solo/anonymous boundaries, empty bases and server-rendered navigation without JavaScript. Responsive checks cover 320/393/412/768/1440 widths, 48-pixel action heights, keyboard order, touch, reduced motion and automated WCAG AA. Navigation unit coverage verifies nested destination resolution and administrator filtering. No tests require production player records.

Run the standard formatting, typecheck, lint and unit/API/architecture checks, production build and smoke suites, documentation checks and the full browser suite. Hosted CI also exercises the existing standalone Redis integration tests; N096 adds no storage scripts or keys. Native Safari, physical devices and screen-reader products remain unverified.

Visually reviewed running-app screenshots with disposable member data: [desktop quick actions](../assets/screenshots/quick-actions-desktop.png) and [mobile quick actions](../assets/screenshots/quick-actions-mobile.png). Full executed results and final-head CI are recorded in draft PR #11's conversation comments.

Deploy through the normal application update only after authorization; there is no data migration. [N097 command palette](command-palette.md) is implemented separately; N098–N100 remain follow-up work on `feature/personalization`. This implementation does not authorize merging or deploying the branch.
