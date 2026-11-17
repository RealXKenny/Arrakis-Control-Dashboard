# Interface font provenance

The root layout self-hosts the unmodified variable TTFs through `next/font/local`. Both build and browser font requests stay local; no Google Fonts API request or test font mapping is required. Full upstream character coverage is retained, so these files are larger than the previously downloaded Latin subsets.

Source: [google/fonts revision 5bb28733cec313b63fbd415b574b5ae35c8aa8b8](https://github.com/google/fonts/tree/5bb28733cec313b63fbd415b574b5ae35c8aa8b8), retrieved November 11, 2026 (UTC). The downloaded binaries were inspected with FontTools: Archivo has `wght` 100–900 and `wdth` 62–125; JetBrains Mono has `wght` 100–800. The application preserves `--font-sans`, `--font-mono`, normal style and `display: swap`; Archivo declares `font-stretch: 62% 125%`.

| Bundled file                                                                  | Upstream path                               | SHA-256                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| [Archivo variable](../../src/assets/fonts/archivo-variable.ttf)               | `ofl/archivo/Archivo[wdth,wght].ttf`        | `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053` |
| [Archivo license](../../src/assets/fonts/archivo-OFL.txt)                     | `ofl/archivo/OFL.txt`                       | `108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b` |
| [JetBrains Mono variable](../../src/assets/fonts/jetbrains-mono-variable.ttf) | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda` |
| [JetBrains Mono license](../../src/assets/fonts/jetbrains-mono-OFL.txt)       | `ofl/jetbrainsmono/OFL.txt`                 | `b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d` |

Archivo: Copyright 2020 The Archivo Project Authors. JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors. Both are distributed under SIL Open Font License 1.1; the complete original licenses accompany the files. See [third-party licenses](THIRD_PARTY_LICENSES.md#archivo-and-jetbrains-mono-fonts).
