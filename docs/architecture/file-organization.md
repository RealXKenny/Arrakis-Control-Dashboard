# File organization

Arrakis Control uses feature ownership with a small set of shared infrastructure directories. A file's location must identify its responsibility. Framework discovery always takes precedence over visual symmetry.

## Top-level ownership

| Directory            | Owns                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `.github/workflows/` | CI and release automation                                                             |
| `docs/`              | Architecture, development, deployment, and API documentation                          |
| `scripts/`           | Executable development, maintenance, runtime, and deployment tools                    |
| `src/app/`           | App Router routes, layouts, metadata, route handlers, and Next.js special files       |
| `src/pages/api/`     | The remaining legacy Pages Router API entry points                                    |
| `src/components/`    | Shared application components and design-system primitives                            |
| `src/features/`      | Business domains and their components, hooks, schemas, services, types, and utilities |
| `src/server/`        | Shared request infrastructure and external-service integrations                       |
| `src/lib/`           | Shared utilities and focused Redis, cache, security, and HTTP modules                 |
| `src/config/`        | Canonical environment validation and application configuration                        |
| `src/types/`         | TypeScript contracts shared across otherwise unrelated domains                        |
| `src/styles/`        | Global styles and design tokens                                                       |
| `src/assets/`        | Bundled images, models, terrain, attribution, and other static resources              |
| `tests/`             | API, architecture, browser, load, and domain-organized unit tests                     |

Generated directories such as `.next/`, `node_modules/`, `coverage/`, `test-results/`, and `playwright-report/` are not source directories. Never commit them. `tsconfig.tsbuildinfo` is also generated and ignored.

## Placement decision guide

Answer the first matching question:

1. **Is Next.js required to discover it?** Put `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, metadata files, and other special files in their supported `app/` location. Required root configuration stays in the root.
2. **Is it an executable maintenance, deployment, or runtime tool?** Put it in `scripts/`, with a subdirectory only when its purpose is clear.
3. **Does it belong to one business domain?** Put it in `src/features/<domain>/`, using `components/`, `hooks/`, `server/`, `styles/`, or another subdirectory only when useful.
4. **Is it reusable application UI?** Put shared navigation and layout components in `src/components/navigation/` or `src/components/layout/`; put design primitives in `src/components/ui/` and feedback components in `src/components/feedback/`.
5. **Is it shared request handling or an external provider client?** Put it in `src/server/` or `src/server/integrations/`.
6. **Is it a shared pure utility or focused infrastructure helper?** Put it in `src/lib/`.
7. **Is it environment or application configuration?** Put it in `src/config/`.
8. **Is it a type shared by unrelated domains?** Put it in `src/types/`; otherwise keep the type with its feature.
9. **Is it a global style or design token?** Put it in `src/styles/`. Keep feature CSS modules with their feature.
10. **Is it a test?** Put domain unit tests in `tests/unit/<domain>/`; use the existing API, browser, architecture, helper, and load homes for those suites.

## Feature ownership

A feature directory is the authoritative home for its implementation. For example:

```text
src/features/guilds/
├── components/
├── hooks/
├── server/
└── question-fields.ts
```

Do not create empty subdirectories or impose this shape on a feature that does not need it. A small feature may contain one module and no children.

Feature-specific components, hooks, schemas, types, and services never move to a global directory merely because they are reusable in principle. Move code only when at least two unrelated domains genuinely need it. Domain composition, such as bases using the linked-player service, is acceptable when the owning domain remains clear. Avoid deep imports that bypass a deliberately documented public contract.

`app/` route files should orchestrate loading and rendering, not own large feature implementations. Complex route UI belongs to its feature. The legacy `pages/api/` layer remains thin and uses the common API boundary.

## Backend, Redis, and configuration

- Shared server request handling lives in `src/server/`.
- Dune Console, adapter, and Discord clients live in `src/server/integrations/`.
- Redis command clients, key definitions, pooling, and cache helpers stay in `src/lib/redis/` and `src/lib/cache/`.
- Feature-owned Redis records and business operations stay in that feature's `server/` modules.
- `src/config/env.ts` is the only canonical environment schema and production gate. Do not add compatibility re-exports or a second schema.
- Environment names, Redis keys, API payloads, and provider behavior must not change during file migration.

## Naming and imports

- Directories and ordinary modules use `kebab-case`.
- React component files use `kebab-case.tsx`.
- Hooks use `use-name.ts` or `use-name.tsx` where JSX is required.
- Unit tests use `feature-name.test.ts`; browser tests use `feature-name.spec.ts`.
- Separate schemas, constants, and types only when a real module is justified.
- Framework filenames such as `page.tsx`, `layout.tsx`, `route.ts`, and `proxy.ts` are exempt.
- Use readable relative imports. Do not introduce aliases, barrels, or indirection solely to shorten paths.
- Update static imports, dynamic imports, mocks, CSS references, workflows, and documentation in the same migration.

## Correct and incorrect placement

Correct:

- `src/features/bases/components/base-preview.tsx` for the base preview.
- `src/features/guilds/server/support.ts` for guild support storage.
- `src/components/navigation/top-navigation.tsx` for the global topbar.
- `src/server/pages-api.ts` for the shared legacy API boundary.
- `scripts/maintenance/rekey-redis.mjs` for the explicit Redis maintenance command.

Incorrect:

- `src/app/bases/_components/base-preview.tsx` for a complex feature renderer.
- `src/components/guild-support.tsx` for a guild-only backend service.
- `src/modules/` or `src/infrastructure/` for anything; those obsolete homes are retired.
- A second environment schema in `src/lib/`.
- A new root utility script when `scripts/` already owns it.
- A new `misc/`, `shared2/`, `temp/`, or similarly ambiguous directory.

## Preventing clutter

Before adding a file, identify its owner and check whether an existing feature or focused shared module already has that responsibility. Do not add root files for convenience. Do not keep compatibility shims after all imports have migrated. Remove empty directories after moves, but never delete a file whose runtime discovery or dynamic references have not been checked.

AI coding agents must read this guide and `AGENTS.md` before creating files, update both when architectural contracts change, run the architecture checks, and preserve unrelated work. Every new file should have an obvious answer to "why does it belong here?"
