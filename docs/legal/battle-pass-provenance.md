# Battle pass reference and provenance

The objective category navigation, completion summaries, reward timeline and editable catalog workflow were adapted from [Icehunter/dune-admin](https://github.com/Icehunter/dune-admin/tree/6b59ba9f7aa9a54c735522089f217bc9a2f54cc4) at revision `6b59ba9f7aa9a54c735522089f217bc9a2f54cc4`, reviewed on 2026-11-16. The reference files are `web/src/tabs/BattlepassTab/TrackView.tsx`, `CardArt.tsx`, `views/ConfigView.tsx`, `views/ProgressView.tsx`, `modals/TierEditorModal.tsx`, and the Go battle-pass catalog, engine and grant-ledger modules. Copyright (c) 2026 Ryan Wilson; MIT terms follow below.

Arrakis implements this experience inside its existing Redis season engine. It retains independent Season XP, the free 100-level cosmetic track, solo fairness, immutable publication, moderated evidence and audited claims. The six categories are Levels, Story, Side quests, Faction, Exploration and Achievements. Original line illustrations replace upstream theme artwork; no upstream embedded images, game artwork or faction logos were copied. Existing uploaded season/reward artwork remains supported.

The reference reads game levels, journey nodes and player tags directly from PostgreSQL and can automatically grant Intel/items. Arrakis does neither. Explicit verification uses the Console's read-only character progression and journey APIs; player tags are unsupported. Verification observes current state, not when a game milestone was originally achieved. Existing completed nodes/levels can qualify once during an active season. There is no background scan, historical baseline reconstruction, Intel grant or new delivery authorization. Optional game delivery remains separately gated and disabled by default.

API contracts were checked against [Console revision 7614611](https://github.com/Red-Blink/dune-awakening-selfhost-docker/tree/761461103c4405a660a9db9b4df2d0684a49da95), specifically `console/api/src/server.js` and `duneDb.js`: `GET /api/players/{id}/progression` returns `capabilities.progression`, canonical `player.actorId`/`controllerId`, and numeric `level`; `GET /api/players/{id}/journey` returns `capabilities.journey` and `rows.story/contract/codex/tutorial` with exact node `id` and boolean `complete`. No mutation endpoint is used. An incompatible Console fails closed; this source review does not claim a live production integration test.

## Upstream MIT license

```text
MIT License

Copyright (c) 2026 Ryan Wilson

---

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
