# Appearance sources and attribution

The palette catalog/helper approach adapts work from **RedBlink's dune-awakening-selfhost-docker**, with theme/picker contributions by **yacketrj** and upstream contributors. Root [LICENSE](../../LICENSE) retains RedBlink's MIT notice and terms. Original dashboard adaptations remain MIT except the separately identified dataset below.

## Reviewed sources

- [PR #296](https://github.com/Red-Blink/dune-awakening-selfhost-docker/pull/296), `be7c99eb26ddc84b7f62267d96d7e736abff379c`: lazy picker, browser storage, cache, accessibility and recovery patterns.
- [PR #298](https://github.com/Red-Blink/dune-awakening-selfhost-docker/pull/298), `556c718b8b9a9e889667639d48fde49c3860ac9c`: 19 original Console palettes, four original faction palettes, 42 swatches and Default. Its `consolePalettes.ts`, `houseSwatches.ts` and default CSS colors are adapted here.
- [PR #299](https://github.com/Red-Blink/dune-awakening-selfhost-docker/pull/299), reviewed head `49f3bc0947ad3f7ea46c64e02cf490738d5d6cb2`: shared role colors, readable fills and complete cleanup. It was open when reviewed; upstream QA claims are not dashboard verification.

Arrakis Control supplies its framework/CSP integration, role mapping, eleven-role custom editor, import/export and tests. Removed third-party theme packs are not restored. The existing fonts and game artwork keep their separate notices. Runtime use fetches no fonts, scripts or palettes from these sources.

## Wiki-derived House/outfit data

`src/features/appearance/house-swatches.ts` retains the 42 records selected upstream from **Dune: Awakening Community Wiki contributors'** [Module:Swatches/data](https://awakening.wiki/Module:Swatches/data), [revision 124684](https://awakening.wiki/index.php?title=Module:Swatches/data&oldid=124684). Game names and marks remain their owners' property.

The source page states **CC BY-NC-SA 4.0**, unless otherwise noted. Those attribution, noncommercial and share-alike terms apply to this dataset and its adaptations; it is **not relicensed under MIT**. Preserve the contributor/source credit, modification notice and [license link](https://creativecommons.org/licenses/by-nc-sa/4.0/) when redistributing. The [legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode) contains the complete terms.

Modifications: upstream selected records, assigned stable IDs/groups and normalized hex case; this dashboard formats them as TypeScript and derives UI colors while preserving the four source slots for preview strips. No swatch images are copied by this feature. Source and license were checked on 15 November 2026 in the user's timezone.
