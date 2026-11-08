---
applyTo: "src/app/**/*.tsx,src/components/**/*.{ts,tsx},src/features/**/components/**/*.{ts,tsx},src/styles/**/*.{css,ts},tailwind.config.ts"
---

# Frontend instructions
- Follow Next.js 16 local guidance in `node_modules/next/dist/docs/` before changing framework behavior, as required by `AGENTS.md`.
- Keep pages and layouts thin, reuse feature components and the single global navigation inventory.
- Maintain Obsidian/Sand/Spice visual tokens, responsive design, accessibility and reduced motion.
- Do not animate ancestors of maps or full-screen previews. Preserve WebGL2 fallback and clean up 3D resources.
- Verify browser-visible behavior; do not claim screenshots or visual testing without performing them.
