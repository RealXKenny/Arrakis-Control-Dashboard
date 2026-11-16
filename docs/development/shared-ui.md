# Shared UI helpers

New screens use the same primitives as navigation, admin tools, maps, profiles and personalization. Imports are direct and feature-neutral; there is no global script to initialize.

## Buttons and menu controls

Import `Button` from `src/components/ui/button.tsx`. It renders a native button and preserves props, refs, disabled state, ARIA, handlers and form behavior. Set `type="button"` for non-submit actions inside forms; use `type="submit"` for submissions. Omitting type keeps native browser behavior.

```tsx
<Button type="button" variant="primary" onClick={openEditor}>
  Create project
</Button>
```

Variants are `primary`, `secondary`, `ghost` and `danger`. Existing specialized classes remain supported without adding a different visual variant. Controls share keyboard focus styling. A menu trigger stays a `Button` with caller-owned `aria-expanded`, `aria-controls` and, where appropriate, `aria-haspopup`. Navigation items remain links.

`control-styles.ts` provides `buttonClass`, `menuItemClass`, `cardClass` and `focusRing`. Use `buttonClass` for an action styled as a link. `menuItemClass` supplies dropdown, drawer and segmented-navigation states. State, authorization, destinations and keyboard interaction remain with the menu owner. The central navigation inventory remains the only route catalog.

## Cards

The shared visual baseline follows the [Console reference](https://try.dunedocker.app/), reviewed at 1440 × 1000 alongside the supplied mobile captures. Headings and standard buttons use normal casing and restrained spacing; cards use subtle borders and soft shadows. The existing topbar is retained. Mobile navigation derives grouped one/two-column tiles from the existing permission-filtered inventory; below 380 pixels tiles become one column. Desktop checks cover 1280–2560 pixels. Existing artwork/illustrations remain; no reference artwork, fonts or application scripts are copied.

Reviewed running-app captures: [PC portal](../assets/screenshots/console-style-portal-desktop.png) and [mobile navigation](../assets/screenshots/console-style-mobile-menu.png). Captures use disposable local fixture accounts, not production player records.

Import `Card` from `src/components/ui/card.tsx`. Its default element is `article`; `as="section"`, `as="aside"` and `as="div"` preserve existing semantics. Default styling uses the shared theme-aware solid surface. Existing specialized classes retain their own styling; combine shared chrome with feature layout through `cardClass`.

```tsx
<Card as="section" aria-labelledby="project-title" className={cardClass({ className: 'p-5' })}>
  <h2 id="project-title">Your project</h2>
</Card>
```

`cardClass({ surface: 'glass', interactive: true, className: 'p-5' })` reuses existing panel chrome and hover treatment for a real link. Keep content and domain logic in features. Do not add clickable wrappers around nested controls. Map and full-screen preview ancestors must remain free of animation.

## Browser behavior

`StatusBadge` provides text-plus-dot neutral/success/warning/danger states; freshness views supply existing server-observed health and retain explicit UTC timestamps. It never invents service readiness. `StatePanel` provides empty/loading/error presentation with an optional explicit retry callback; it performs no requests. Tasks and activity views use it for empty states. Compact `PageHeader` supports an optional short description and existing action slots.

Focused modules in `src/lib/ui/` have no import-time DOM access or server imports:

- `focus.ts`: `containTabFocus` handles visible, enabled, non-inert controls, forward/reverse wrapping, displaced focus and empty modals. Give non-native modal containers `tabIndex={-1}`. Callers own initial focus, dialog opening/closing and Escape. `restoreFocus` skips disconnected or hidden/inert openers.
- `scroll-lock.ts`: `lockPageScroll(document.body)` returns an idempotent release. Overlapping overlays can close in either order; the final release restores the preceding inline overflow value and priority.
- `download.ts`: `downloadBlob` attaches a temporary native anchor, removes it even if clicking fails and revokes the object URL after one second. It rejects path/control filenames and never fetches remote URLs. Features must validate and bound export data before passing a Blob.

Appearance/command dialogs and the mobile drawer share focus and scroll behavior. Color/personal-data exports share cleanup. Theme derivation stays in appearance; HTTP/session/rate-limit/Redis helpers retain their existing server owners. UI helpers never perform game writes, authentication or automatic request retries.

## Verification and extension

Architecture coverage rejects new raw `<button>` and `<article>` elements outside their primitives. Shared helper unit tests cover native semantics, nested/out-of-order scroll cleanup and failed-download cleanup. Browser suites exercise menus, dialogs, exports, custom light colors, keyboard/mobile controls and accessibility.

Reuse existing helpers first. Promote logic when unrelated features need it, keep browser/server imports safe and add behavioral regression coverage. Specialized canvas, map, game and form controls keep their appropriate native elements. This layer adds no dependencies, APIs or persistence.
