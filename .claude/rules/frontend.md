# Frontend and design
- Respect the existing Obsidian/Sand/Spice palette, sharp corners, hard shadows, and Dune-inspired dark visual language.
- Use shared components from `src/components/` and feature-owned components under their domain.
- The global topbar and route inventory belong to `src/components/navigation/`; do not recreate retired workspace navigation.
- Support keyboard navigation, contrast, responsive layouts, reduced motion, loading, empty and error states.
- Do not animate ancestors of 2D/3D map or full-screen base previews.
- Preserve 2D map fallback for unsupported WebGL2; manage 3D resources and model disposal.
- For Next.js changes read the installed `node_modules/next/dist/docs/` guidance required by `AGENTS.md`.
- Verify visual changes in an actual browser when available; never claim screenshots were captured unless they were.
